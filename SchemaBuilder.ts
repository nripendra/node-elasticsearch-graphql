import { getAllIndices, getMappingInfo } from './elastic-helper';
import { makeExecutableSchema } from 'graphql-tools';
import { SchemaParser } from './SchemaParser';

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
    constructor(private baseUrl: string, private config?: ISchemaBuilderConfig) {
        this.parser = new SchemaParser(this.baseUrl);
        this.config = this.config || {
            getAllIndices: getAllIndices,
            getMappingInfo: getMappingInfo
        };
    }

    public get schemaTree() {
        return this.parser.schemaTree;
    }

    public addScalar(scalar: {
        name: string,
        parseLiteral: (val: any) => any,
        parseValue: (val: any) => any,
        serialize: (val: any) => any
    }) {
        this.parser.addScalar(scalar);
    }

    public async build() {
        let indices = await this.config.getAllIndices(this.baseUrl);

        for (let indexInfo of indices) {
            let mappingsInfo = await this.config.getMappingInfo(this.baseUrl, indexInfo.index);
            this.parser.parse(indexInfo.index, mappingsInfo);
        }
    }

    public makeExecutableSchema() {
        this.parser.buildScalars();
        return makeExecutableSchema({
            typeDefs: this.parser.toString(),
            resolvers: this.parser.resolvers,
        });
    }
}
