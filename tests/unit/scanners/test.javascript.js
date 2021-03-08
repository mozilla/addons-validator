import ESLint from 'eslint';
import { oneLine } from 'common-tags';

import {
  ESLINT_ERROR,
  ESLINT_RULE_MAPPING,
  EXTERNAL_RULE_MAPPING,
  TEMPORARY_APIS,
  VALIDATION_ERROR,
  VALIDATION_WARNING,
} from 'const';
import * as messages from 'messages';
import { apiToMessage } from 'utils';
import JavaScriptScanner from 'scanners/javascript';
import Linter from 'linter';

import {
  fakeMessageData,
  getRuleFiles,
  getVariable,
  validMetadata,
  runJsScanner,
} from '../helpers';

describe('JavaScript Scanner', () => {
  it('should report a proper scanner name', () => {
    expect(JavaScriptScanner.scannerName).toEqual('javascript');
  });

  it('should thrown an error without a filename', () => {
    expect(() => {
      var jsScanner = new JavaScriptScanner(''); // eslint-disable-line
    }).toThrow('Filename is required');
  });

  it('should have an options property', () => {
    const jsScanner = new JavaScriptScanner('', 'filename.txt');
    expect(typeof jsScanner.options).toEqual('object');
    // This test assures us the options can be accessed like an object.
    expect(typeof jsScanner.options.someUndefinedProp).toEqual('undefined');

    const jsScannerWithOptions = new JavaScriptScanner('', 'filename.txt', {
      foo: 'bar',
    });
    expect(jsScannerWithOptions.options.foo).toEqual('bar');
  });

  it('should not have rules disabled by default', () => {
    const jsScanner = new JavaScriptScanner('', 'filename.txt');
    expect(jsScanner.disabledRules).toEqual([]);
  });

  it('should be initialised with disabledRules from options', () => {
    const jsScanner = new JavaScriptScanner('', 'filename.txt', {
      disabledRules:
        'no-eval, no-implied-eval,     no-unsanitized/method, no-unsanitized/property',
    });
    expect(typeof jsScanner.disabledRules).toEqual('object');
    // This test assures us the disabledRules built properly.
    expect(jsScanner.disabledRules).toEqual([
      'no-eval',
      'no-implied-eval',
      'no-unsanitized/method',
      'no-unsanitized/property',
    ]);
  });

  it('should be initialised with empty excluded rules object, when there is no string', () => {
    const jsScanner = new JavaScriptScanner('', 'filename.txt', {
      disabledRules: true,
    });
    expect(jsScanner.disabledRules).toEqual([]);
  });

  it('should be initialised with valid rules only', () => {
    const jsScanner = new JavaScriptScanner('', 'filename.txt', {
      disabledRules: 'no-eval, no-implied-eval, no-unsanitized-method,,,,,',
    });
    expect(jsScanner.disabledRules).toEqual([
      'no-eval',
      'no-implied-eval',
      'no-unsanitized-method',
    ]);
  });

  it('should pass when async/await is used', async () => {
    const code = 'var foo = async a => a;';
    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support object spread syntax', async () => {
    const code = oneLine`
      const config = {};
      const actual = {...config, foo: 'bar'};
    `;

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support optional chaining', async () => {
    const code = 'const dogName = adventurer.dog?.name;';

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support nullish coalescing operator', async () => {
    const code = 'const baz = 0 ?? 42;';

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  // See: https://github.com/tc39/proposal-class-fields
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('should support public class fields', async () => {
    const code = 'class MyClass { a = 1; }';

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support BigInt short-hand notation', async () => {
    const code = 'const bigInt = 2166136261n;';

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support dynamic imports', async () => {
    const code = `(async () => { await import('some-script.js'); })();`;

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support numeric separators', async () => {
    const code = 'const num = 1_0;';

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should support es6 modules', async () => {
    const addonLinter = new Linter({
      _: ['tests/fixtures/webextension_es6_module'],
    });
    addonLinter.print = sinon.stub();

    await addonLinter.scan();
    expect(addonLinter.collector.errors.length).toEqual(0);
    expect(addonLinter.collector.warnings.length).toEqual(0);
  });

  it('should support optional catch binding', async () => {
    const code = oneLine`
      try {} catch {}
    `;

    const jsScanner = new JavaScriptScanner(code, 'code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  it('should scan node modules', async () => {
    const code = 'el.innerHTML = evilContent';

    const jsScanner = new JavaScriptScanner(
      code,
      'node_modules/module/code.js'
    );

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages[0]).toMatchObject({ code: 'UNSAFE_VAR_ASSIGNMENT' });
  });

  it('should scan bower components', async () => {
    const code = 'el.innerHTML = evilContent';

    const jsScanner = new JavaScriptScanner(
      code,
      'bower_components/component/code.js'
    );

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages[0]).toMatchObject({ code: 'UNSAFE_VAR_ASSIGNMENT' });
  });

  it('should scan dotfiles', async () => {
    const code = 'el.innerHTML = evilContent';

    const jsScanner = new JavaScriptScanner(code, '.code.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages[0]).toMatchObject({ code: 'UNSAFE_VAR_ASSIGNMENT' });
  });

  it('should create an error message when encountering a syntax error', async () => {
    let code = 'var m = "d;';
    let jsScanner = new JavaScriptScanner(code, 'badcode.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages[0].code).toEqual(messages.JS_SYNTAX_ERROR.code);
    expect(linterMessages[0].type).toEqual(VALIDATION_ERROR);

    // Test another error for good measure.
    code = 'var aVarThatDoesnt != exist;';
    jsScanner = new JavaScriptScanner(code, 'badcode.js');

    const { linterMessages: moreValidationMessages } = await jsScanner.scan();
    expect(moreValidationMessages[0].code).toEqual(
      messages.JS_SYNTAX_ERROR.code
    );
    expect(moreValidationMessages[0].type).toEqual(VALIDATION_ERROR);
  });

  it('should reject on missing message code', async () => {
    class FakeESLintClass {
      async lintText() {
        return Promise.resolve([
          {
            filePath: 'badcode.js',
            messages: [
              {
                fatal: false,
              },
            ],
          },
        ]);
      }
    }

    const FakeESLint = {
      ESLint: FakeESLintClass,
    };

    const jsScanner = new JavaScriptScanner('whatever', 'badcode.js');

    await expect(jsScanner.scan({ _ESLint: FakeESLint })).rejects.toThrow(
      /JS rules must pass a valid message/
    );
  });

  // This is just a precaution against disabling environments in ESLint, which
  // isn't allowed as of writing, but will warn us if it ever happens :-)
  it('ignores /*eslint-env*/ comments', async () => {
    const code = oneLine`/*eslint-env es6:false*/
      var makeBigger = (number) => {
        return number + 1;
      }`;
    const jsScanner = new JavaScriptScanner(code, 'badcode.js');

    const { linterMessages } = await jsScanner.scan();
    expect(linterMessages).toEqual([]);
  });

  // This test is pretty much copied from ESLint, to make sure dependencies
  // don't change behaviour on us.
  // https://github.com/mozilla/addons-linter/pull/98#issuecomment-158890847
  it('ignores /*global foo*/', () => {
    const eslint = ESLint.linter;
    const config = { rules: { test: 2 } };
    let ok = false;

    eslint.defineRules({
      test(context) {
        return {
          Program() {
            const foo = getVariable(context.getScope(), 'foo');
            expect(foo).toBeFalsy();

            ok = true;
          },
        };
      },
    });

    eslint.verify('/* global foo */', config, { allowInlineConfig: false });
    expect(ok).toBeTruthy();
  });

  it('should pass addon metadata to rules', async () => {
    const fakeMessages = {
      METADATA_NOT_PASSED: {
        ...fakeMessageData,
        code: 'METADATA_NOT_PASSED',
        message: 'Should not happen',
        description: 'Should not happen',
      },
    };
    const fakeMetadata = {
      addonMetadata: validMetadata({ guid: 'snowflake' }),
    };
    const fakeESLintMapping = { 'metadata-not-passed': ESLINT_ERROR };

    const jsScanner = new JavaScriptScanner(
      'var hello = "something";',
      'index.html',
      fakeMetadata
    );

    const { linterMessages } = await runJsScanner(jsScanner, {
      scanOptions: {
        _messages: fakeMessages,
        _ruleMapping: fakeESLintMapping,
      },
      fixtureRules: ['metadata-not-passed'],
    });

    expect(linterMessages).toEqual([]);
  });

  it('should export all rules in rules/javascript', async () => {
    // We skip the "run" check here for now as that's handled by ESLint.
    const ruleFiles = getRuleFiles('javascript');
    const externalRulesCount = Object.keys(EXTERNAL_RULE_MAPPING).length;

    expect(ruleFiles.length + externalRulesCount).toEqual(
      Object.keys(ESLINT_RULE_MAPPING).length
    );

    const jsScanner = new JavaScriptScanner('', 'badcode.js');

    await runJsScanner(jsScanner);
    // This is the number of custom ESLint rules we have in addons-linter. When
    // adding a new rule, please increase this value.
    expect(jsScanner._rulesProcessed).toEqual(16);
  });

  TEMPORARY_APIS.forEach((api) => {
    it(`should return warning when ${api} is used with no id`, async () => {
      const fakeMetadata = { addonMetadata: validMetadata({}) };
      const jsScanner = new JavaScriptScanner(
        `chrome.${api}();`,
        'code.js',
        fakeMetadata
      );

      const { linterMessages } = await runJsScanner(jsScanner);
      expect(linterMessages.length).toEqual(1);
      expect(linterMessages[0].code).toEqual(apiToMessage(api));
      expect(linterMessages[0].type).toEqual(VALIDATION_WARNING);
    });
  });

  TEMPORARY_APIS.forEach((api) => {
    it(`should pass when ${api} is used with an id`, async () => {
      const fakeMetadata = { addonMetadata: validMetadata({ id: 'snark' }) };
      const jsScanner = new JavaScriptScanner(
        `chrome.${api}();`,
        'code.js',
        fakeMetadata
      );

      const { linterMessages } = await runJsScanner(jsScanner);
      expect(linterMessages).toEqual([]);
    });
  });

  it('treats a non-code string message as the message', async () => {
    const _ruleMapping = { 'message-rule': ESLINT_ERROR };
    const fakeMetadata = { addonMetadata: validMetadata({}) };
    const jsScanner = new JavaScriptScanner('foo.bar', 'code.js', fakeMetadata);

    const { linterMessages } = await runJsScanner(jsScanner, {
      scanOptions: { _ruleMapping },
      fixtureRules: ['message-rule'],
    });
    expect(linterMessages.length).toEqual(1);
    expect(linterMessages[0].code).toEqual('this is the message');
    expect(linterMessages[0].message).toEqual('this is the message');
  });

  describe('detectSourceType', () => {
    it('should detect module', async () => {
      const code = oneLine`
        import 'foo';
      `;

      const jsScanner = new JavaScriptScanner(code, 'code.js');
      await runJsScanner(jsScanner);

      expect(jsScanner.sourceType).toEqual('module');
    });

    it('should detect module (multiple statements)', async () => {
      const code = oneLine`
        let value = 0;
        export { value };
      `;

      const jsScanner = new JavaScriptScanner(code, 'code.js');
      await runJsScanner(jsScanner);

      expect(jsScanner.sourceType).toEqual('module');
    });

    it('should detect script', async () => {
      const code = oneLine`
        eval('foo');
      `;

      const jsScanner = new JavaScriptScanner(code, 'code.js');
      await runJsScanner(jsScanner);

      expect(jsScanner.sourceType).toEqual('script');
    });

    it('should default to script in case of SyntaxError', async () => {
      const code = oneLine`
        an import foo
      `;

      const jsScanner = new JavaScriptScanner(code, 'code.js');
      await runJsScanner(jsScanner);

      expect(jsScanner.sourceType).toEqual('script');
    });
  });
});
