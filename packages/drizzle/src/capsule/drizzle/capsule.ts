export default {
  name: 'drizzle',
  dependencies: [],
  boot: {
    init: async ({ deps }: { deps: Record<string, unknown> }) => {
      // Drizzle ORM instance should be injected as a dependency
    },
  },
};
