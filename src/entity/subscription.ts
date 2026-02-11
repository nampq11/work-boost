export type Platform = 'slack' | 'telegram';

export interface Subscription {
  userId: string;
  platforms: {
    slack?: string; // Slack user/channel ID
    telegram?: string; // Telegram chat ID
  };
  enabled: Platform[]; // Currently active platforms
  timezone?: string;
  subscribedAt: Date;
  lastSentAt?: Date;
}

export interface CreateSubscriptionDto {
  platform: Platform;
  platformId: string;
  timezone?: string;
}

// Helper to check if user is subscribed to a specific platform
export function isPlatformEnabled(subscription: Subscription, platform: Platform): boolean {
  return subscription.enabled.includes(platform) && !!subscription.platforms[platform];
}

// Helper to get all active platforms for a subscription
export function getActivePlatforms(subscription: Subscription): Platform[] {
  return subscription.enabled.filter((p) => !!subscription.platforms[p]);
}
