/**
 * La suite se corre desde apps/api con `npx jest`, nunca desde la raíz.
 *
 * `rootDir` apunta a la raíz del repositorio a propósito: las guardas barren
 * todo el monorepo, no la carpeta donde apareció el error. Ver
 * docs/12-el-metodo.md, «la guarda que mira una carpeta de tres».
 */
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/apps/api/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@todohierro/shared$': '<rootDir>/packages/shared/src/index.ts',
  },
};
