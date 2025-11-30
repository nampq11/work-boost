/*
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
    if (typeof input !== 'string') return input;

    // Remove null bytes and control characters except newlines and tabs
    // deno-lint-ignore no-control-regex
    return input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

/*
 * Validates that a string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

/*
 * Validates session ID format (allows UUID or custom format)
 */
export function isValidSessionId(sessionId: string): boolean {
    // Allow UUID format or alphanumeric with hyphens/underscores (max 50 characters)
    return isValidUUID(sessionId) || /^[a-zA-Z0-9_-]{1,50}$/.test(sessionId);
}