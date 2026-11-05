export interface PushMessage { title: string; body: string; data?: Record<string, string> }
/** Replace with an APNs/FCM implementation. Must not put precise location or PII in `body` (lock-screen visible). */
export interface PushNotifier {
  send(userId: string, tokens: string[], msg: PushMessage): Promise<void>;
}
export class StubPushNotifier implements PushNotifier {
  sent: { userId: string; tokens: string[]; msg: PushMessage }[] = [];
  async send(userId: string, tokens: string[], msg: PushMessage) { this.sent.push({ userId, tokens, msg }); }
}
