import url from 'url';

import upath from 'upath';
import Jed from 'jed';
import semver from 'semver';
import { oneLine } from 'common-tags';
import { osLocaleSync } from 'os-locale';

import log from 'logger';
import { PACKAGE_TYPES, LOCAL_PROTOCOLS } from 'const';

/* global nodeRequire, localesRoot */

const SOURCE_MAP_RE = /\/\/[#@]\s(source(?:Mapping)?URL)=\s*(\S+)/;
// For MV2 add-ons, Firefox's version format is laxer than Chrome's, it accepts:
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version/format
// We choose a slightly restricted version of that format (but still more
// permissive than Chrome) to allow Beta addons, per:
// https://extensionworkshop.com/documentation/publish/distribute-pre-release-versions/
const TOOLKIT_VERSION_REGEX = /^(\d+\.?){1,3}\.(\d+([A-z]+(-?\d+)?))$/;
// 1.2.3buildid5.6 is used in practice but not matched by TOOLKIT_VERSION_REGEX.
// Use this pattern to accept the used format without being too permissive.
// See https://github.com/mozilla/addons-linter/issues/3998
const TOOLKIT_WITH_BUILDID_REGEX = /^\d+(?:\.\d+){0,2}buildid\d{8}\.\d{6}$/;

export function isToolkitVersionString(version) {
  // We should be starting with a string. Limit length, see bug 1393644
  if (typeof version !== 'string' || version.length > 100) {
    return false;
  }
  return (
    TOOLKIT_VERSION_REGEX.test(version) ||
    TOOLKIT_WITH_BUILDID_REGEX.test(version)
  );
}

export function isValidVersionString(version) {
  // We should be starting with a string. Limit length, see bug 1393644
  if (typeof version !== 'string' || version.length > 100) {
    return false;
  }

  const parts = version.split('.');

  if (parts.length > 4) {
    return false;
  }

  // Non-zero values cannot start with 0 and we allow numbers up to 9 digits.
  return !parts.some((part) => !/^(0|[1-9][0-9]{0,8})$/.test(part));
}

// Represents an error condition related to a user error (e.g. an invalid
// configuration option passed to the linter class, usually through the
// command line arguments).
//
// In bin/addons-linter instances of this error are recognized through the
// error name property and by default they will be logged on stderr as
// plain error messages and the error stack trace omitted (unless explicitly
// requested by passing --stack as an additional CLI options, useful for
// debugging reasons).
export class AddonsLinterUserError extends Error {
  get name() {
    return 'AddonsLinterUserError';
  }
}

export function errorParamsToUnsupportedVersionRange(errorParams) {
  const { min_manifest_version, max_manifest_version } = errorParams || {};
  if (min_manifest_version != null || max_manifest_version != null) {
    return [
      min_manifest_version ? `< ${min_manifest_version}` : undefined,
      max_manifest_version ? `> ${max_manifest_version}` : undefined,
    ]
      .filter((e) => e !== undefined)
      .join(', ');
  }

  return '';
}

export function normalizePath(iconPath) {
  // Convert the icon path to a URL so we can strip any fragments and resolve
  // . and .. automatically. We need an absolute URL to use as a base so we're
  // using https://example.com/.
  const { pathname } = new URL(iconPath, 'https://example.com/');

  // Convert filename to unix path separator (as the ones stored
  // into the scanned files map).
  return upath.toUnix(decodeURIComponent(pathname).slice(1));
}

/*
 * Takes an AST node and returns the root property.
 *
 * example: foo().bar.baz() will return the AST node for foo.
 */
export function getRootExpression(node) {
  let root = node.callee;

  // If we encounter a member, grab the parent
  if (node.callee.type === 'MemberExpression') {
    let parent = node.callee.object;
    while (parent.type !== 'Identifier') {
      if (parent.callee.type === 'MemberExpression') {
        parent = parent.callee.object;
      } else {
        parent = parent.callee;
      }
    }
    root = parent;
  }

  return root;
}

/*
 * Get a variable from a eslint context object if it exists, otherwise
 * undefined.
 */
export function getVariable(context, name) {
  const { variables } = context.getScope();
  let result;
  variables.forEach((variable) => {
    if (
      variable.name === name &&
      variable.defs &&
      variable.defs[0] &&
      variable.defs[0].name &&
      variable.defs[0].name.parent
    ) {
      result = variable.defs[0].name.parent.init;
    }
  });
  return result;
}

export function getLocale() {
  return osLocaleSync();
}

export function getI18Data(locale) {
  let i18ndata = {};
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    i18ndata = nodeRequire(`${localesRoot}/${locale}/messages.js`);
  } catch (err) {
    log.info('Initialize locales using extract-locales command');
  }

  return i18ndata;
}

// Functionality based on oneLine from declandewet/common-tags, copied from
// mozilla/addons-frontend.
function oneLineTranslationString(translationKey) {
  if (translationKey && translationKey.replace && translationKey.trim) {
    return translationKey.replace(/(?:\n(?:\s*))+/g, ' ').trim();
  }
  return translationKey;
}

/*
 * Gettext utils. Used for translating strings.
 */
export function buildI18nObject(i18nData) {
  const _jed = new Jed(i18nData);

  return {
    jed: _jed,
    getI18Data,
    _: (str) => {
      return _jed.gettext(oneLineTranslationString(str));
    },
    gettext: (str) => {
      return _jed.gettext(oneLineTranslationString(str));
    },
    sprintf: (fmt, args) => {
      return _jed.sprintf(fmt, args);
    },
  };
}

export const i18n = buildI18nObject(getI18Data(getLocale()));

/*
 * Check the minimum node version is met
 */
export async function checkMinNodeVersion(minVersion, _process = process) {
  // eslint-disable-next-line no-param-reassign
  minVersion = minVersion || '0.12.0';
  if (!semver.gte(_process.version, minVersion)) {
    throw new Error(oneLine`Node version must be ${minVersion} or
                    greater. You are using ${_process.version}.`);
  }
}

export function getPackageTypeAsString(numericPackageType) {
  const packageKeys = Object.keys(PACKAGE_TYPES);
  for (let i = 0; i < packageKeys.length; i++) {
    const packageType = packageKeys[i];
    if (parseInt(numericPackageType, 10) === PACKAGE_TYPES[packageType]) {
      return packageType;
    }
  }
  throw new Error(`Invalid package type constant "${numericPackageType}"`);
}

/*
 * Looks through all exported functions and returns only
 * "public" *functions* that aren't prefixed with an _
 *
 * Used for ignoring private functions and constants in rules files.
 * Rules can have private functions we don't run; anything that
 * starts with an "_" shouldn't be returned.
 *
 * This exists because we export private functions in rule files
 * for testing.
 */
export function ignorePrivateFunctions(list) {
  const filteredList = {};

  Object.keys(list).forEach((functionName) => {
    if (
      functionName.startsWith('_') === false &&
      typeof list[functionName] === 'function'
    ) {
      filteredList[functionName] = list[functionName];
    }
  });

  return filteredList;
}

/*
 * Check a filename to make sure it's valid; used by scanners so we never
 * accept new scanners that don't specify which file they're referencing.
 */
export function ensureFilenameExists(filename) {
  if (typeof filename !== 'string' || filename.length < 1) {
    throw new Error('Filename is required');
  }
}

export function isLocalUrl(urlInput) {
  const parsedUrl = url.parse(urlInput);
  const { protocol, path } = parsedUrl;

  // Check protocol is chrome: or resource: if set.
  // Details on the chrome protocol are here: https://goo.gl/W52T0Q
  // Details on resource protocol are here: https://goo.gl/HHqeJA
  if (protocol && !LOCAL_PROTOCOLS.includes(protocol)) {
    return false;
  }
  // Disallow protocol-free remote urls.
  if (path.startsWith('//')) {
    return false;
  }
  return true;
}

export function apiToMessage(string) {
  return string
    .replace(/^extension/, 'ext')
    .replace(/\./g, '_')
    .toUpperCase()
    .substr(0, 25);
}

export function isBrowserNamespace(string) {
  return ['browser', 'chrome'].includes(string);
}

export function parseCspPolicy(policy) {
  if (!policy) {
    return {};
  }

  // See https://www.w3.org/TR/CSP3/#parse-serialized-policy

  const parsedPolicy = {};
  const directives = policy.toLowerCase().split(';');

  directives.forEach((directive) => {
    const tokens = directive.trim().split(/\s+/);

    const name = tokens[0];

    if (name && !parsedPolicy[name]) {
      parsedPolicy[name] = tokens.slice(1, tokens.length);
    }
  });

  return parsedPolicy;
}

export function getLineAndColumnFromMatch(match) {
  const matchedLines = match.input.substr(0, match.index).split('\n');
  const matchedColumn = matchedLines.slice(-1)[0].length + 1;
  const matchedLine = matchedLines.length;

  return { matchedLine, matchedColumn };
}

/**
 * Determines if the source text is minified.
 * Using the percentage no. of the indented lines from a sample set of lines
 * to determine if the js file is minified.
 * Inspired by code for the Firefox Developer Toolbar.
 */
export function couldBeMinifiedCode(code) {
  // Fast exit if `code` is empty. Could happen in tests, but also in real
  // files.
  if (!code) {
    return false;
  }

  // If there's a source map reference it's very certainly minified code.
  if (SOURCE_MAP_RE.test(code)) {
    return true;
  }

  // Number of lines to look at, taken from the head of the code.
  const sampleSize = 30;

  // Threshold in percent of indented lines to mark a file as not
  // minified.
  const indentCountThreshold = 20; // percentage

  // Length of a line that looks suspicious of being minified
  const hugeLinesLength = 500;

  // Number of huge lines to also mark a file as potentially minified
  // Hint: Minified AngularJS has 12 lines, jQuery 4
  const hugeLinesThreshold = 4;

  let lineEndIndex = 0;
  let lineStartIndex = 0;
  let lines = 1;
  let indentCount = 0;
  let hugeLinesCount = 0;

  // Strip comments.
  const normalizedCode = code.replace(/\/\*[\S\s]*?\*\/|\/\/.+/g, '');

  while (lines < sampleSize) {
    lineEndIndex = normalizedCode.indexOf('\n', lineStartIndex);

    if (lineEndIndex === -1) {
      break;
    }

    const currentLine = normalizedCode.slice(lineStartIndex, lineEndIndex);

    if (/^\s+/.test(currentLine)) {
      indentCount++;
    }

    if (currentLine.length >= hugeLinesLength) {
      hugeLinesCount++;
    }

    lineStartIndex = lineEndIndex + 1;
    lines++;
  }

  return (
    (indentCount / lines) * 100 < indentCountThreshold ||
    hugeLinesCount > hugeLinesThreshold
  );
}

export function firefoxStrictMinVersion(manifestJson) {
  // Note: The _validate method of parsers/manifestjson.js copies
  // "browser_specific_settings" to "applications".
  if (
    manifestJson.applications &&
    manifestJson.applications.gecko &&
    manifestJson.applications.gecko.strict_min_version &&
    typeof manifestJson.applications.gecko.strict_min_version === 'string'
  ) {
    return parseInt(
      manifestJson.applications.gecko.strict_min_version.split('.')[0],
      10
    );
  }
  return null;
}

export function androidStrictMinVersion(manifestJson) {
  // Note: The _validate method of parsers/manifestjson.js copies
  // "browser_specific_settings" to "applications".
  if (
    manifestJson.applications &&
    manifestJson.applications.gecko_android &&
    manifestJson.applications.gecko_android.strict_min_version &&
    typeof manifestJson.applications.gecko_android.strict_min_version ===
      'string'
  ) {
    // Note: gecko_android is recognized since 113.
    return parseInt(
      manifestJson.applications.gecko_android.strict_min_version.split('.')[0],
      10
    );
  }
  // Fall back on gecko.min_version if gecko_android.min_version isn't provided
  const version = firefoxStrictMinVersion(manifestJson);
  if (version >= 69 && version < 79) {
    // There has not been any Firefox for Android release after 68, until 79.
    // When the declared gecko.strict_min_version is in this version range,
    // treat the version as 79 to avoid useless warnings as seen in:
    // https://github.com/mozilla/addons-linter/pull/5090#issuecomment-1795770582
    return 79;
  }
  return version;
}

/**
 * @param {*} versionAdded
 * @param {number} minVersion
 * @returns {boolean} true if versionAdded has a strictly greater major version than minVersion
 */
export function basicCompatVersionComparison(versionAdded, minVersion) {
  const asNumber = parseInt(versionAdded, 10);
  return !Number.isNaN(asNumber) && asNumber > minVersion;
}

/**
 * @param {*} supportInfo - bcd support info of a feature
 * @returns {string|boolean} The first version number to support the feature
 *          or a boolean indicating if the feature is supported at all. We do
 *          not consider any holes in the supported versions, only the first
 *          stable version is taken into account.
 *          May also return "preview", as defined at https://github.com/mdn/browser-compat-data/blob/main/docs/data-guidelines/index.md#choosing-preview-values
 */
export function firstStableVersion(supportInfo) {
  let supportInfoArray = supportInfo;
  if (!Array.isArray(supportInfo)) {
    supportInfoArray = [supportInfo];
  }
  return supportInfoArray.reduce((versionAdded, supportEntry) => {
    if (
      !Object.prototype.hasOwnProperty.call(supportEntry, 'flags') &&
      (!versionAdded ||
        (supportEntry.version_added &&
          !basicCompatVersionComparison(
            supportEntry.version_added,
            parseInt(versionAdded, 10)
          )))
    ) {
      return supportEntry.version_added;
    }
    return versionAdded;
  }, false);
}

export function isCompatible(bcd, path, minVersion, application) {
  const steps = path.split('.');
  let { api } = bcd.webextensions;
  for (const step of steps) {
    if (Object.prototype.hasOwnProperty.call(api, step)) {
      api = api[step];
    } else {
      break;
    }
  }
  // API namespace may be undocumented or not implemented, ignore in that case.
  if (api.__compat) {
    const supportInfo = api.__compat.support[application];
    const versionAdded = firstStableVersion(supportInfo);
    // Note: if versionAdded is false or not a number, this will return true.
    return !basicCompatVersionComparison(versionAdded, minVersion);
  }
  return true;
}

export function createCompatibilityRule(
  application,
  message,
  context,
  bcd,
  hasBrowserApi
) {
  const { addonMetadata } = context.settings;
  const minVersion =
    addonMetadata &&
    firefoxStrictMinVersion({
      applications: {
        gecko: {
          strict_min_version: context.settings.addonMetadata.firefoxMinVersion,
        },
      },
    });
  if (minVersion) {
    return {
      MemberExpression(node) {
        if (
          !node.computed &&
          node.object.object &&
          isBrowserNamespace(node.object.object.name)
        ) {
          const namespace = node.object.property.name;
          const property = node.property.name;
          const api = `${namespace}.${property}`;
          if (
            hasBrowserApi(namespace, property, addonMetadata) &&
            !isCompatible(bcd, api, minVersion, application)
          ) {
            context.report(node, message.messageFormat, {
              api,
              minVersion: addonMetadata.firefoxMinVersion,
            });
          }
        }
      },
    };
  }
  return {};
}
