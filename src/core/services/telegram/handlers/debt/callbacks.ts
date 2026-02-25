import type { Context } from 'grammy';
import type { Agent, Database } from '../../../index.ts';

interface CallbackHandlerDeps {
  db: Database;
  agent: Agent;
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

  // Route to appropriate handler
  switch (action) {
    case 'record':
      await handleRecordDebt(ctx, deps);
      break;

    case 'menu':
      await handleDebtMenuCallback(ctx);
      break;

    case 'direction':
      if (params[0]) {
        await handleDirectionSelect(ctx, deps, params[0] as 'lent' | 'borrowed');
      }
      break;

    case 'list':
      await handleListCallback(ctx, deps);
      break;

    case 'filter':
      if (params[0]) {
        await handleFilterCallback(ctx, deps, params[0]);
      }
      break;

    case 'show':
      if (params[0]) {
        await handleShowDebtDetails(ctx, deps, params[0]);
      }
      break;

    case 'settle':
      if (params[0]) {
        await handleSettleCallback(ctx, deps, params[0]);
      }
      break;

    case 'delete':
      if (params[0]) {
        await handleDeleteCallback(ctx, deps, params[0]);
      }
      break;

    case 'confirm':
      if (params[0] === 'delete' && params[1]) {
        await handleDeleteConfirm(ctx, deps, params[1]);
      }
      break;

    case 'summary':
      await handleSummaryCallback(ctx, deps);
      break;

    case 'remind':
      if (params.length === 0) {
        await handleRemindCallback(ctx, deps);
      } else if (params[0]) {
        await handleSetReminderFrequency(ctx, deps, params[0] as 'weekly' | 'monthly' | 'never');
      }
      break;

    default:
      await ctx.answerCallbackQuery({
        text: 'Unknown action',
      });
  }
}
