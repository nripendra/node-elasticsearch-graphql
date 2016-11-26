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

/** A JSON based in memory representation of GraphQL schema. */
export interface ISchemaTree {
    types: any,
    query: string,
    args: any
    resolvers: any,
    scalars: GraphQLScalarType[],
    toString: string
}

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
    public schemaTree: ISchemaTree;
    /** Downloads and parses elasticsearch index mapping metadata to build schema-tree */
    constructor(private baseUrl: string) {
        let _toString = this.toString.bind(this);
        this.schemaTree = {
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

    /** Create schema types and queries based on mappings metadata of given schema */
    public parse(indexName: string, mappingInfo: { mappings: any }) {

        for (let type in mappingInfo.mappings) {
            let typeName = type;
            if (typeName === 'logs') {
                typeName = indexName;
            } else {
                typeName = indexName + '_' + typeName;
            }
            typeName = typeName.replace(/[^a-zA-Z0-9_]/, '_');

            this.schemaTree.types[typeName] = {};
            this.schemaTree.types[typeName + '_LIST'] = {
                'totalCount': 'Int',
                'from': 'Int',
                'size': 'Int',
                'hitCount': 'Int',
                'items': [typeName]
            };

            let props = mappingInfo.mappings[type].properties || {};
            let kv = this.schemaTree.types[typeName];
            Object.keys(props).forEach(key => {
                let k = key.replace(/[^a-zA-Z0-9_]/, '_');
                let propType = props[key].type;
                kv[k] = elasticTypeToGraphQLType[propType] || propType;
            });

            this.schemaTree.types.Query['all_' + typeName] = typeName + '_LIST';
            this.schemaTree.types.Query[typeName] = typeName;
            this.schemaTree.args['all_' + typeName] = [{
                name: 'search',
                type: 'JSON'
            }];
            this.schemaTree.args[typeName] = [{
                name: 'id',
                type: 'JSON'
            }];

            let searchResolver = indexSearchResolver(this.baseUrl, indexName, type);
            this.schemaTree.resolvers.Query['all_' + typeName] = searchResolver;

            let getResolver = indexGetResolver(this.baseUrl, indexName, type);
            this.schemaTree.resolvers.Query[typeName] = getResolver;
        }
    }

    /** Build schema defination string, using the type/schema defination language of GraphQL */
    public toString() {
        let lines = [];

        for (let scalar of this.schemaTree.scalars) {
            lines.push(`scalar ${scalar.name}`);
        }

        for (let type in this.schemaTree.types) {
            lines.push(`type ${type} {`);
            lines.push(Object.keys(this.schemaTree.types[type]).map(key => {
                let normalizedKey = this.normalizeField(key);
                let normalizedType = this.normalizeTypeName(this.schemaTree.types[type][key]);
                return `${normalizedKey} : ${normalizedType}`;
            }));
            lines.push('}');
        }
        lines.push(`schema { query: ${this.schemaTree.query}}`);

        return lines.join('\n');;
    }

    /** Add a custom GraphQLScalarType. JSON and Date are supported by default */
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
            this.schemaTree.scalars.push(sc);
        }
    }

    /** Convert GraphQLScalarType to the form that is understood by `graphql-tools` */
    public buildScalars() {
        for (let sc of this.schemaTree.scalars) {
            this.schemaTree.resolvers[sc.name] = {
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
        let propArgs = this.schemaTree.args[field];
        if (propArgs && propArgs.length > 0) {
            let args = propArgs.map(arg => arg.name + ':' + arg.type).join(',');
            return `${field}(${args})`;
        } else {
            return `\t ${field}`;
        }
    }
}
