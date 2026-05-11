export default {
  name: 'auth',
  routes: [
    { method: 'POST', path: '/auth/login', action: 'login' },
    { method: 'POST', path: '/auth/verify', action: 'verify' }
  ],
  events: {
    publishes: ['auth.login'],
    subscribes: [
      { event: 'user.blocked', action: 'handleUserBlocked' }
    ]
  },
  dependencies: ['database']
};
