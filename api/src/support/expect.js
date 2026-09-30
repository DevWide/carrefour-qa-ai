import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import chai from 'chai';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Plugin do Chai: expect(body).to.matchSchema(schema)
 * A mensagem de erro sempre contém "schema" — o Allure agrupa essas falhas na categoria de contrato.
 */
chai.use((_chai) => {
  _chai.Assertion.addMethod('matchSchema', function (schema) {
    const validate = ajv.compile(schema);
    const valid = validate(this._obj);
    const detalhes = (validate.errors || [])
      .map((e) => `${e.instancePath || '(raiz)'} ${e.message}${e.params?.additionalProperty ? `: ${e.params.additionalProperty}` : ''}`)
      .join('; ');
    this.assert(
      valid,
      `esperava que o corpo respeitasse o schema, mas: ${detalhes}`,
      'esperava que o corpo NÃO respeitasse o schema',
    );
  });
});

export const { expect } = chai;
