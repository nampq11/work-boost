import type { AgentPort } from '@work-boost/brain';
import type { Database } from '@work-boost/data-provider';
import type { Context } from 'grammy';

interface CallbackHandlerDeps {
  db: Database;
  agent: AgentPort;
}

/**
 * Main callback handler for all debt-related actions
 * Routes callbacks to specific handlers based on action type
 */
export async function handleDebtCallback(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;

  // Parse the callback data
  // Format: action:debt:<action>[:params...]
  const parts = callbackData.split(':');

  if (parts.length < 3 || parts[0] !== 'action' || parts[1] !== 'debt') {
    return;
  }

  const action = parts[2];
  const params = parts.slice(3);

  // Import handlers dynamically to avoid circular dependencies
  const {
    handleRecordDebt,
    handleDirectionSelect,
    handleListCallback,
    handleFilterCallback,
    handleShowDebtDetails,
    handleSettleCallback,
    handleDeleteCallback,
    handleDeleteConfirm,
    handleSummaryCallback,
    handleRemindCallback,
    handleSetReminderFrequency,
    handleDebtMenuCallback,
  } = await import('./index.ts');

  type DebtCallbackHandler = (
    callbackContext: Context,
    dependencies: CallbackHandlerDeps,
    callbackParams: string[],
  ) => Promise<void>;

  const actionHandlers: Record<string, DebtCallbackHandler> = {
    record: (callbackContext, dependencies) => handleRecordDebt(callbackContext, dependencies),
    menu: (callbackContext) => handleDebtMenuCallback(callbackContext),
    direction: (callbackContext, dependencies, callbackParams) => {
      const direction = callbackParams[0];
      if (direction === 'lent' || direction === 'borrowed') {
        return handleDirectionSelect(callbackContext, dependencies, direction);
      }
      return Promise.resolve();
    },
    list: (callbackContext, dependencies) => handleListCallback(callbackContext, dependencies),
    filter: (callbackContext, dependencies, callbackParams) => {
      const filter = callbackParams[0];
      return filter
        ? handleFilterCallback(callbackContext, dependencies, filter)
        : Promise.resolve();
    },
    show: (callbackContext, dependencies, callbackParams) => {
      const debtId = callbackParams[0];
      return debtId
        ? handleShowDebtDetails(callbackContext, dependencies, debtId)
        : Promise.resolve();
    },
    settle: (callbackContext, dependencies, callbackParams) => {
      const debtId = callbackParams[0];
      return debtId
        ? handleSettleCallback(callbackContext, dependencies, debtId)
        : Promise.resolve();
    },
    delete: (callbackContext, dependencies, callbackParams) => {
      const debtId = callbackParams[0];
      return debtId
        ? handleDeleteCallback(callbackContext, dependencies, debtId)
        : Promise.resolve();
    },
    confirm: (callbackContext, dependencies, callbackParams) => {
      const [confirmationAction, debtId] = callbackParams;
      return confirmationAction === 'delete' && debtId
        ? handleDeleteConfirm(callbackContext, dependencies, debtId)
        : Promise.resolve();
    },
    summary: (callbackContext, dependencies) =>
      handleSummaryCallback(callbackContext, dependencies),
    remind: (callbackContext, dependencies, callbackParams) => {
      const frequency = callbackParams[0];
      if (!frequency) return handleRemindCallback(callbackContext, dependencies);
      if (frequency === 'weekly' || frequency === 'monthly' || frequency === 'never') {
        return handleSetReminderFrequency(callbackContext, dependencies, frequency);
      }
      return Promise.resolve();
    },
  };

  const handler = actionHandlers[action];
  if (handler) {
    await handler(ctx, deps, params);
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Unknown action' });
}
