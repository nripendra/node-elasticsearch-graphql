import { indexGetResolver, indexSearchResolver } from './elastic-helper';
import { GraphQLScalarType } from 'graphql';
import GraphQLDateType from './graphql-type-date';
import GraphQLJSONType from './graphql-type-json';

let elasticTypeToGraphQLType = {
    'text': 'String',
    'string': 'String',
    'float': 'Float',
    'double': 'Float',
    'long': 'Int',
    'boolean': 'Boolean',
    'date': 'Date'
};

/**
 * schema = {
 *   types: {
 *       "Index1": {
 *           "Prop1": "Int!",
 *           "Prop2": "String"
 *       },
 *       "Index1_LIST": {
 *           "totalCount": "Int",
 *           "from": "Int",
 *           "size": "Int",
 *           "hitCount": "Int",
 *           "items": ["Index1"]
 *       },
 *       "Query": {
 *           "all_Index1 (search: JSON)": "Index1_LIST",
 *           "Index1 (id: JSON)": "Index1"
 *       }
 *   },
 *   "query" : "Query"
 * }
 */
export class SchemaParser {
    private _schema: any;
    constructor(private baseUrl: string) {
        let _toString = this.toString.bind(this);
        this._schema = {
            types: {
                Query: {}
            },
            query: 'Query',
            args: {},
            resolvers: {
                Query: {}
            },
            scalars: [GraphQLDateType, GraphQLJSONType],
            toString: _toString
        };
    }

    public parse(indexName: string, mappingInfo: { mappings: any }) {

        for (let type in mappingInfo.mappings) {
            let typeName = type;
            if (typeName === 'logs') {
                typeName = indexName;
            } else {
                typeName = indexName + '_' + typeName;
            }
            typeName = typeName.replace(/[^a-zA-Z0-9_]/, '_');

            this._schema.types[typeName] = {};
            this._schema.types[typeName + '_LIST'] = {
                'totalCount': 'Int',
                'from': 'Int',
                'size': 'Int',
                'hitCount': 'Int',
                'items': [typeName]
            };

            let props = mappingInfo.mappings[type].properties || {};
            let kv = this._schema.types[typeName];
            Object.keys(props).forEach(key => {
                let k = key.replace(/[^a-zA-Z0-9_]/, '_');
                let propType = props[key].type;
                kv[k] = elasticTypeToGraphQLType[propType] || propType;
            });

            this._schema.types.Query['all_' + typeName] = typeName + '_LIST';
            this._schema.types.Query[typeName] = typeName;
            this._schema.args['all_' + typeName] = [{
                name: 'search',
                type: 'JSON'
            }];
            this._schema.args[typeName] = [{
                name: 'id',
                type: 'JSON'
            }];

            let searchResolver = indexSearchResolver(this.baseUrl, indexName, type);
            this._schema.resolvers.Query['all_' + typeName] = searchResolver;

            let getResolver = indexGetResolver(this.baseUrl, indexName, type);
            this._schema.resolvers.Query[typeName] = getResolver;
        }
        // this.schema;
    }

    public get schemaTree() {
        return this._schema;
    }

    public toString() {
        let lines = [];

        for (let scalar of this._schema.scalars) {
            lines.push(`scalar ${scalar.name}`);
        }

        for (let type in this._schema.types) {
            lines.push(`type ${type} {`);
            lines.push(Object.keys(this._schema.types[type]).map(key => {
                let normalizedKey = this.normalizeField(key);
                let normalizedType = this.normalizeTypeName(this._schema.types[type][key]);
                return `${normalizedKey} : ${normalizedType}`;
            }));
            lines.push('}');
        }
        lines.push(`schema { query: ${this._schema.query}}`);

        return lines.join('\n');;
    }

    public get resolvers() {
        return this._schema.resolvers;
    }

    public addScalar(scalar: GraphQLScalarType | GraphQLScalarType[]) {
        let scalars: GraphQLScalarType[] = [];
        if (Array === scalar.constructor) {
            scalar = scalar as GraphQLScalarType[];
            scalars = [...scalar];
        } else {
            scalar = scalar as GraphQLScalarType;
            scalars = [scalar];
        }

        for (let sc of scalars) {
            this._schema.scalars.push(sc);
        }
    }

    public buildScalars() {
        for (let sc of this._schema.scalars) {
            this._schema.resolvers[sc.name] = {
                __parseLiteral(val) {
                    return sc.parseLiteral(val);
                },
                __parseValue(val) {
                    return sc.parseValue(val);
                },
                __serialize(val) {
                    return sc.serialize(val);
                }
            };
        }
    }

    private normalizeTypeName(value: string | any[]) {
        return Array === value.constructor ? `[${value}]` : value;
    }

    private normalizeField(field: string) {
        let propArgs = this._schema.args[field];
        if (propArgs && propArgs.length > 0) {
            let args = propArgs.map(arg => arg.name + ':' + arg.type).join(',');
            return `${field}(${args})`;
        } else {
            return `\t ${field}`;
        }
    }
}
