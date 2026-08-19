/// <reference lib="deno.unstable" />

import type {
  ExtensionContext,
  ExtensionCronJob,
  ExtensionHandler,
  ExtensionRouter,
  WorkBoostExtension,
} from './types.ts';

interface RegisteredRoute {
  method: string;
  path: string;
  handler: ExtensionHandler;
}

export type CronRegistrar = (name: string, schedule: string, handler: () => Promise<void>) => void;

export class ExtensionManager {
  private readonly extensions = new Map<string, WorkBoostExtension>();
  private readonly routes: RegisteredRoute[] = [];
  private readonly jobs: ExtensionCronJob[] = [];
  private readonly initialized = new Set<string>();

  constructor(private readonly ctx: ExtensionContext) {}

  use(extension: WorkBoostExtension): this {
    if (this.extensions.has(extension.name)) {
      this.ctx.logger.warn(`Extension "${extension.name}" already registered. Overwriting.`);
    }
    this.extensions.set(extension.name, extension);
    return this;
  }

  async initAll(): Promise<void> {
    for (const [name, extension] of this.extensions) {
      if (this.initialized.has(name)) continue;

      const pendingRoutes: RegisteredRoute[] = [];
      const router: ExtensionRouter = {
        get: (path, handler) => pendingRoutes.push({ method: 'GET', path, handler }),
        post: (path, handler) => pendingRoutes.push({ method: 'POST', path, handler }),
        put: (path, handler) => pendingRoutes.push({ method: 'PUT', path, handler }),
        delete: (path, handler) => pendingRoutes.push({ method: 'DELETE', path, handler }),
      };

      try {
        await extension.init(this.ctx);
        extension.registerRoutes?.(router);
        const registeredJobs = extension.registerJobs?.() || [];
        this.validateJobs(name, registeredJobs);
        this.validateRoutes(name, pendingRoutes);
        this.routes.push(...pendingRoutes);
        this.jobs.push(...registeredJobs);
        this.initialized.add(name);
        this.ctx.logger.info(`[ExtensionManager] Loaded extension: ${name}`);
      } catch (error) {
        try {
          await extension.dispose?.();
        } catch (disposeError) {
          this.ctx.logger.error(`[ExtensionManager] Failed to clean up extension: ${name}`, {
            error: disposeError,
          });
        }
        this.ctx.logger.error(`[ExtensionManager] Failed to initialize extension: ${name}`, {
          error,
        });
      }
    }
  }

  async handleRequest(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const route = this.routes.find(
      (registeredRoute) =>
        registeredRoute.method === request.method && registeredRoute.path === url.pathname,
    );

    if (!route) return null;

    try {
      return await route.handler(request);
    } catch (error) {
      this.ctx.logger.error(`[ExtensionManager] Route failed: ${request.method} ${url.pathname}`, {
        error,
      });
      return new Response('Extension route failed', { status: 500 });
    }
  }

  registerAllCronJobs(cronRegistrar: CronRegistrar = Deno.cron): void {
    for (const job of this.jobs) {
      try {
        cronRegistrar(job.name, job.schedule, async () => {
          this.ctx.logger.info(`[Cron] Executing job: ${job.name}`);
          try {
            await job.handler();
          } catch (error) {
            this.ctx.logger.error(`[Cron] Job failed: ${job.name}`, { error });
          }
        });
        this.ctx.logger.info(`[Cron] Registered job: ${job.name} (${job.schedule})`);
      } catch (error) {
        this.ctx.logger.error(`[Cron] Failed to register job: ${job.name}`, { error });
      }
    }
  }

  async disposeAll(): Promise<void> {
    const initializedExtensions = [...this.extensions.entries()].filter(([name]) =>
      this.initialized.has(name),
    );

    for (const [name, extension] of initializedExtensions.reverse()) {
      try {
        await extension.dispose?.();
      } catch (error) {
        this.ctx.logger.error(`[ExtensionManager] Failed to dispose extension: ${name}`, { error });
      }
    }

    this.initialized.clear();
    this.extensions.clear();
    this.routes.length = 0;
    this.jobs.length = 0;
  }

  private validateRoutes(name: string, routes: RegisteredRoute[]): void {
    const existingRoutes = [...this.routes, ...routes];
    for (let index = this.routes.length; index < existingRoutes.length; index++) {
      const route = existingRoutes[index];
      const duplicate = existingRoutes.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.method === route.method &&
          candidate.path === route.path,
      );
      if (duplicate !== -1) {
        throw new Error(
          `Extension "${name}" attempted to register duplicate route ${route.method} ${route.path}`,
        );
      }
    }
  }

  private validateJobs(name: string, jobs: ExtensionCronJob[]): void {
    for (const job of jobs) {
      if (
        !job ||
        typeof job.name !== 'string' ||
        !job.name ||
        typeof job.schedule !== 'string' ||
        !job.schedule ||
        typeof job.handler !== 'function'
      ) {
        throw new Error(`Extension "${name}" registered an invalid cron job`);
      }

      if (this.jobs.some((existingJob) => existingJob.name === job.name)) {
        throw new Error(`Cron job "${job.name}" is already registered`);
      }
    }

    const names = new Set<string>();
    for (const job of jobs) {
      if (names.has(job.name)) throw new Error(`Cron job "${job.name}" is duplicated`);
      names.add(job.name);
    }
  }
}
