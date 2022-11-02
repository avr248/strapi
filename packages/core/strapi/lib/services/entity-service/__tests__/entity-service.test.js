'use strict';

jest.mock('bcryptjs', () => ({ hashSync: () => 'secret-password' }));

const { EventEmitter } = require('events');
const createEntityService = require('..');
const entityValidator = require('../../entity-validator');

jest.mock('../../utils/upload-files', () => jest.fn(() => Promise.resolve()));

describe('Entity service', () => {
  global.strapi = {
    getModel: jest.fn(() => ({})),
    config: {
      get() {
        return [];
      },
    },
    query: jest.fn(() => ({})),
  };

  describe('Decorator', () => {
    test.each(['create', 'update', 'findMany', 'findOne', 'delete', 'count', 'findPage'])(
      'Can decorate',
      async (method) => {
        const instance = createEntityService({
          strapi: {},
          db: {},
          eventHub: new EventEmitter(),
        });

        const methodFn = jest.fn();
        const decorator = () => ({
          [method]: methodFn,
        });

        instance.decorate(decorator);

        const args = [{}, {}];
        await instance[method](...args);
        expect(methodFn).toHaveBeenCalled();
      }
    );
  });

  describe('Find', () => {
    test('Returns first element for single types', async () => {
      const data = {
        id: 1,
        title: 'Test',
      };

      const fakeQuery = {
        findOne: jest.fn(() => Promise.resolve(data)),
      };

      const fakeDB = {
        query: jest.fn(() => fakeQuery),
      };

      const fakeStrapi = {
        getModel: jest.fn(() => {
          return { kind: 'singleType', privateAttributes: [] };
        }),
      };

      const instance = createEntityService({
        strapi: fakeStrapi,
        db: fakeDB,
        eventHub: new EventEmitter(),
      });

      const result = await instance.findMany('test-model');

      expect(fakeStrapi.getModel).toHaveBeenCalledTimes(1);
      expect(fakeStrapi.getModel).toHaveBeenCalledWith('test-model');

      expect(fakeDB.query).toHaveBeenCalledWith('test-model');
      expect(fakeQuery.findOne).toHaveBeenCalledWith({});
      expect(result).toEqual(data);
    });
  });

  describe('Create', () => {
    let instance;
    const fakeQuery = {
      count: jest.fn(() => 0),
      create: jest.fn(({ data }) => ({
        id: 1,
        ...data,
      })),
      findOne: jest.fn(),
    };
    const fakeModels = {};

    beforeAll(() => {
      global.strapi.getModel.mockImplementation((modelName) => fakeModels[modelName]);
      global.strapi.query.mockImplementation(() => fakeQuery);

      const fakeDB = {
        query: jest.fn(() => fakeQuery),
      };

      const fakeStrapi = {
        getModel: jest.fn((modelName) => fakeModels[modelName]),
      };

      instance = createEntityService({
        strapi: fakeStrapi,
        db: fakeDB,
        eventHub: new EventEmitter(),
        entityValidator,
      });
    });
    beforeEach(() => {
      jest.clearAllMocks();
    });
    afterAll(() => {
      global.strapi.getModel.mockImplementation(() => ({}));
    });

    describe('assign default values', () => {
      beforeAll(() => {
        fakeModels['test-model'] = {
          kind: 'contentType',
          modelName: 'test-model',
          privateAttributes: [],
          options: {},
          attributes: {
            attrStringDefaultRequired: { type: 'string', default: 'default value', required: true },
            attrStringDefault: { type: 'string', default: 'default value' },
            attrBoolDefaultRequired: { type: 'boolean', default: true, required: true },
            attrBoolDefault: { type: 'boolean', default: true },
            attrIntDefaultRequired: { type: 'integer', default: 1, required: true },
            attrIntDefault: { type: 'integer', default: 1 },
            attrEnumDefaultRequired: {
              type: 'enumeration',
              enum: ['a', 'b', 'c'],
              default: 'a',
              required: true,
            },
            attrEnumDefault: {
              type: 'enumeration',
              enum: ['a', 'b', 'c'],
              default: 'b',
            },
            attrPassword: { type: 'password' },
          },
        };
      });
      test('should create record with all default attributes', async () => {
        const data = {};

        await expect(instance.create('test-model', { data })).resolves.toMatchObject({
          attrStringDefaultRequired: 'default value',
          attrStringDefault: 'default value',
          attrBoolDefaultRequired: true,
          attrBoolDefault: true,
          attrIntDefaultRequired: 1,
          attrIntDefault: 1,
          attrEnumDefaultRequired: 'a',
          attrEnumDefault: 'b',
        });
      });

      test('should create record with default and required attributes', async () => {
        const data = {
          attrStringDefault: 'my value',
          attrBoolDefault: false,
          attrIntDefault: 2,
          attrEnumDefault: 'c',
        };

        await expect(instance.create('test-model', { data })).resolves.toMatchObject({
          attrStringDefault: 'my value',
          attrBoolDefault: false,
          attrIntDefault: 2,
          attrEnumDefault: 'c',
          attrStringDefaultRequired: 'default value',
          attrBoolDefaultRequired: true,
          attrIntDefaultRequired: 1,
          attrEnumDefaultRequired: 'a',
        });
      });

      test('should create record with provided data', async () => {
        const data = {
          attrStringDefaultRequired: 'my value',
          attrStringDefault: 'my value',
          attrBoolDefaultRequired: true,
          attrBoolDefault: true,
          attrIntDefaultRequired: 10,
          attrIntDefault: 10,
          attrEnumDefaultRequired: 'c',
          attrEnumDefault: 'a',
          attrPassword: 'fooBar',
        };

        await expect(instance.create('test-model', { data })).resolves.toMatchObject({
          ...data,
          attrPassword: 'secret-password',
        });
      });
    });

    describe('with files', () => {
      beforeAll(() => {
        fakeModels['test-model'] = {
          kind: 'collectionType',
          collectionName: 'test-model',
          options: {},
          attributes: {
            name: {
              type: 'string',
            },
            activity: {
              displayName: 'activity',
              type: 'component',
              repeatable: true,
              component: 'basic.activity',
            },
          },
          modelType: 'contentType',
          modelName: 'test-model',
        };
        fakeModels['basic.activity'] = {
          collectionName: 'components_basic_activities',
          info: {
            displayName: 'activity',
          },
          options: {},
          attributes: {
            docs: {
              allowedTypes: ['images', 'files', 'videos', 'audios'],
              type: 'media',
              multiple: true,
            },
            name: {
              type: 'string',
            },
          },
          uid: 'basic.activity',
          category: 'basic',
          modelType: 'component',
          modelName: 'activity',
          globalId: 'ComponentBasicActivity',
        };
      });
      test('should create record with attached files', async () => {
        const uploadFiles = require('../../utils/upload-files');
        global.strapi.getModel.mockImplementation((modelName) => fakeModels[modelName]);
        const data = {
          name: 'demoEvent',
          activity: [{ name: 'Powering the Aviation of the Future' }],
        };
        const files = {
          'activity.0.docs': {
            size: 381924,
            path: '/tmp/upload_4cab76a3a443b584a1fd3aa52e045130',
            name: 'thisisajpeg.jpeg',
            type: 'image/jpeg',
            mtime: '2022-11-03T13:36:51.764Z',
          },
        };

        fakeQuery.findOne.mockResolvedValue({ id: 1, ...data });

        await instance.create('test-model', { data, files });

        expect(global.strapi.getModel).toBeCalled();
        expect(uploadFiles).toBeCalled();
        expect(uploadFiles).toBeCalledTimes(1);
        expect(uploadFiles).toBeCalledWith(
          'test-model',
          {
            id: 1,
            name: 'demoEvent',
            activity: [
              {
                id: 1,
                __pivot: {
                  field: 'activity',
                  component_type: 'basic.activity',
                },
              },
            ],
          },
          files
        );
      });
    });
  });
});
