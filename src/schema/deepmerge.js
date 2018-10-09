/**
 * deepmerge 2.0 changed the way the array merge worked. This is the suggested
 * solution from their README for how to use the old version.
 *
 * https://github.com/KyleAMathews/deepmerge/blob/3ab89f2d2c938fc2e045c4ba822da0ffb81e4891/readme.md#arraymerge
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import merge from 'deepmerge';

const emptyTarget = (value) => (Array.isArray(value) ? [] : {});
const clone = (value, options) => merge(emptyTarget(value), value, options);

function oldArrayMerge(target, source, options) {
  const destination = target.slice();

  source.forEach((e, i) => {
    if (typeof destination[i] === 'undefined') {
      const cloneRequested = options.clone !== false;
      const shouldClone = cloneRequested && options.isMergeableObject(e);
      destination[i] = shouldClone ? clone(e, options) : e;
    } else if (options.isMergeableObject(e)) {
      destination[i] = merge(target[i], e, options);
    } else if (target.indexOf(e) === -1) {
      destination.push(e);
    }
  });

  return destination;
}

export default (a, b, opts) => {
  if (opts) {
    throw new Error(
      'opts are not supported, use the deepmerge package directly'
    );
  }
  return merge(a, b, { arrayMerge: oldArrayMerge });
};
