// Minimal history stack for the app's views.
const stack = [{ view: 'home' }];
let at = 0;
const subs = new Set();
const notify = () => subs.forEach((f) => f(stack[at]));

export const router = {
  get route() { return stack[at]; },
  get canBack() { return at > 0; },
  get canForward() { return at < stack.length - 1; },
  go(route) {
    const cur = stack[at];
    if (cur && JSON.stringify(cur) === JSON.stringify(route)) { notify(); return; }
    stack.splice(at + 1);
    stack.push(route);
    at = stack.length - 1;
    if (stack.length > 80) { stack.shift(); at--; }
    notify();
  },
  replace(route) { stack[at] = route; notify(); },
  back() { if (at > 0) { at--; notify(); } },
  forward() { if (at < stack.length - 1) { at++; notify(); } },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};
