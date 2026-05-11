export const meta = {
  name: 'calculator',
  routes: [
    { method: 'POST', path: '/calc/sum', action: 'sum' },
    { method: 'POST', path: '/calc/multiply', action: 'multiply' }
  ],
  events: {
    publishes: ['calc.completed'],
    subscribes: []
  },
  dependencies: []
};
