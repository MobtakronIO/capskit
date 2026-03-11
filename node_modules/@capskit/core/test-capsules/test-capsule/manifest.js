export const manifest = {
    name: 'test-capsule',
    requires: ['database'],
    actions: {
        ping: {
            handler: async (payload, context) => {
                return { message: 'pong', db: !!context.deps.database };
            },
            description: 'Ping action'
        }
    }
};
