import { getApp } from '../runtime.ts';

export default { fetch: (req: Request) => getApp().submit(req) };
