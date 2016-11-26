import { getAllIndices, getMappingInfo } from './elastic-helper';
import { makeExecutableSchema } from 'graphql-tools';
import { SchemaParser } from './SchemaParser';
import { GraphQLScalarType } from 'graphql';

/** Configuration for schema-builder */
interface ISchemaBuilderConfig {
    getAllIndices(baseUrl: string): Promise<{ index: string }[]>;
    getMappingInfo(baseUrl: string, indexName: string): Promise<{ mappings: any }>;
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
 *           "all_Index1 (esQuery: JSON)": "Index1_LIST",
 *           "Index1 (id: JSON)": "Index1"
 *       }
 *   },
 *   "query" : "Query"
 * }
 */
export class SchemaBuilder {
    private parser: SchemaParser;
    private isParsed: boolean = false;
    /** Builds schema from elasticsearch metadata */
    constructor(private baseUrl: string, private config?: ISchemaBuilderConfig) {
        this.parser = new SchemaParser(this.baseUrl);
        this.config = this.config || {
            getAllIndices: getAllIndices,
            getMappingInfo: getMappingInfo
        };
    }

    /** Add custom scalar types. GraphQLDateType, GraphQLJSONType are supported by default */
    public addScalar(scalar: GraphQLScalarType | GraphQLScalarType[]) {
        this.parser.addScalar(scalar);
    }

    /** Creates schema `tree` from elasticsearch indices. */
    public async parse() {
        this.isParsed = true;
        let indices = await this.config.getAllIndices(this.baseUrl);

        for (let indexInfo of indices) {
            let mappingsInfo = await this.config.getMappingInfo(this.baseUrl, indexInfo.index);
            this.parser.parse(indexInfo.index, mappingsInfo);
        }
        return this.parser.schemaTree;
    }

    /** Creates executable schema that can be used with graphqlHTTP */
    public async build() {
        if (!this.isParsed) {
            await this.parse();
        }
        this.parser.buildScalars();
        return makeExecutableSchema({
            typeDefs: this.parser.toString(),
            resolvers: this.parser.schemaTree.resolvers,
        });
    }
}
