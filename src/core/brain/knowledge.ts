/**
 * Brain Knowledge
 *
 * Domain expertise loaded on-demand.
 * Make knowledge available, not mandatory. Load when relevant,
 * not upfront.
 */

import type { Knowledge } from './types.ts';

/**
 * Knowledge about daily work report formatting
 */
export const dailyWorkReportKnowledge: Knowledge = {
  id: 'daily-work-report-format',
  name: 'Daily Work Report Format',
  description: 'Vietnamese daily work report formatting rules and structure',
  loaded: false,
  load: async () => {
    const content = `
Format rules for Vietnamese daily work reports:

1. Each section must start with exactly:
   - "1. Việc hoàn thành hôm trước?"
   - "2. Việc dự định làm hôm trước nhưng không hoàn thành?"
   - "3. Việc dự định làm hôm nay?"

2. If a section has no tasks, output exactly "N/A"

3. Tasks should be indented with 2 spaces and start with project code

4. Project codes must be preserved exactly as given

Example format:
1. Việc hoàn thành hôm trước?
- B2: squirrel_11: nghiên cứu cải tiến phương pháp tìm kiếm
2. Việc dự định làm hôm trước nhưng không hoàn thành?
- N/A
3. Việc dự định làm hôm nay
- UI: thiết kế giao diện người dùng
`;
    return content;
  },
};

/**
 * Knowledge about debt tracking
 */
export const debtTrackingKnowledge: Knowledge = {
  id: 'debt-tracking-rules',
  name: 'Debt Tracking Rules',
  description: 'Rules for parsing and categorizing debt entries',
  loaded: false,
  load: async () => {
    const content = `
Debt tracking rules:

Direction rules:
- "lent", "gave", "loaned" → LENT (you gave money, they owe you)
- "borrowed", "took", "owe" → BORROWED (you took money, you owe them)

Person extraction:
- Usually after "to" or "from"
- Extract the person's name only

Currency handling:
- If no currency is specified, use "USD"
- Support common currencies: USD, EUR, VND, JPY, etc.

Amount rules:
- Amount should always be a positive number
- Extract numerical value from input

Reason extraction:
- Optional context/reason for the debt
- If reason is unclear, set it to null
`;
    return content;
  },
};

/**
 * Get all available knowledge sources
 */
export function getAllKnowledge(): Knowledge[] {
  return [dailyWorkReportKnowledge, debtTrackingKnowledge];
}

/**
 * Get knowledge by ID
 */
export function getKnowledgeById(id: string): Knowledge | undefined {
  const allKnowledge = getAllKnowledge();
  return allKnowledge.find((k) => k.id === id);
}

/**
 * Load knowledge on-demand
 * Caches the content after first load
 */
export async function loadKnowledge(knowledge: Knowledge): Promise<string> {
  if (knowledge.loaded && knowledge.content) {
    return knowledge.content;
  }

  const content = await knowledge.load();
  knowledge.loaded = true;
  knowledge.content = content;
  return content;
}
