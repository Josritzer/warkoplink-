import { beforeAll } from 'vitest';

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});
