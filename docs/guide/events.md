# Events

The events capsule provides pub/sub messaging for CapsKit applications. Capsules communicate asynchronously by publishing events that other capsules subscribe to.

---

## Events Capsule API

The events capsule exposes these caps:

| Cap | Description |
|---|---|
| `emit` | Publish event → dispatch to subscribers |
| `subscribe` | Runtime subscription (add listener) |
| `unsubscribe` | Runtime unsubscription (remove listener) |
| `list-subscriptions` | Inspect current subscriptions |

---

## ctx.emit — The Convenience Method

Caps use `ctx.emit` to publish events. This delegates to the events capsule:

```ts
// Inside any cap:
ctx.emit('order.created', { orderId: order.id });
```

Under the hood, this calls `capskit.call('events.emit', { body: { event, data } })`. The kernel has no event logic of its own.

---

## Declaring Event Subscriptions in CapMeta

Caps declare event subscriptions in their `meta.events.subscribes` array:

```ts
// capsules/notifications/caps/send-welcome-email.cap.ts
export const meta: CapMeta = {
  name: 'send-welcome-email',
  events: {
    subscribes: [
      { event: 'user.created', cap: 'send-welcome-email' },
    ],
  },
};

export default async function sendWelcomeEmail(input: CapInput, ctx: CapContext) {
  const { userId, email, name } = input.body;
  await ctx.deps.emailService.send({
    to: email,
    subject: 'Welcome!',
    template: 'welcome',
    data: { name },
  });
}
```

The events capsule reads all loaded cap metadata at boot and builds the subscription map automatically.

---

## Wildcard Patterns

Subscriptions support wildcard patterns:

```ts
events: {
  subscribes: [
    { event: 'orders.*', cap: 'log-order-event' },    // Matches orders.created, orders.cancelled, etc.
    { event: 'user.*.created', cap: 'track-creation' }, // Matches user.admin.created, user.member.created
  ],
}
```

### Wildcard Rules

- `*` matches any single segment
- `orders.*` matches `orders.created`, `orders.cancelled`, but NOT `orders.items.added`
- `orders.**` (if supported) matches all nested segments

---

## Event Flow

```
1. Cap calls ctx.emit('order.created', { orderId: '1' })
2. Kernel delegates to events.emit cap
3. Events cap finds exact subscribers for 'order.created'
4. Events cap finds wildcard subscribers matching 'order.created'
5. Each subscriber cap is invoked with event data
6. Errors in subscribers are caught and sent to dead letter handling
```

---

## Dead Letter Handling

When a subscriber cap fails, the events cap handles the failure:

```ts
// In events/caps/emit.cap.ts
for (const sub of allSubs) {
  ctx.invoke(sub.capPath, { body: data }).catch(err => {
    ctx.invoke('events.handle-dead-letter', {
      body: {
        event,
        data,
        capPath: sub.capPath,
        error: err.message,
      },
    });
  });
}
```

Dead letter events can be subscribed to for monitoring and alerting:

```ts
events: {
  subscribes: [
    { event: 'events.dead-letter', cap: 'log-dead-letter' },
  ],
}
```

---

## Best Practices

1. **Use past-tense event names** — `order.created`, not `createOrder`.
2. **Keep event payloads small** — include IDs, not full objects.
3. **Design subscribers to be idempotent** — events may be delivered multiple times.
4. **Document events** — maintain an event registry for your system.
5. **Use wildcards sparingly** — explicit subscriptions are easier to reason about.

---

## Example: Complete Event Flow

### Publisher

```ts
// capsules/orders/caps/create-order.cap.ts
export default async function createOrder(input: CapInput, ctx: CapContext) {
  const order = await orderRepository.create(ctx.deps.database, input.body);
  ctx.emit('order.created', { orderId: order.id, userId: order.userId });
  return { order };
}
```

### Subscriber

```ts
// capsules/notifications/caps/send-order-confirmation.cap.ts
export const meta: CapMeta = {
  name: 'send-order-confirmation',
  events: {
    subscribes: [
      { event: 'order.created', cap: 'send-order-confirmation' },
    ],
  },
};

export default async function sendOrderConfirmation(input: CapInput, ctx: CapContext) {
  const { orderId, userId } = input.body;
  // Send confirmation email...
}
```

---

## Next Steps

- [Caps](./caps.md) — Cap handler signature and cap file format
- [Built-in Capsules](./built-in-capsules.md) — Events capsule details
- [Architecture](./architecture.md) — System-level view
