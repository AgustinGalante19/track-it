declare const __TRACK_IT_BUILD_ID__: string;
export const buildInfo = { id: typeof __TRACK_IT_BUILD_ID__ === 'string' ? __TRACK_IT_BUILD_ID__ : 'development' };
