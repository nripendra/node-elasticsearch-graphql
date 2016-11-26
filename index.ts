import * as express from 'express';
import * as graphqlHTTP from 'express-graphql';
import * as url from 'url';
import { SchemaBuilder } from './SchemaBuilder';

let ELASTIC_BASEURL = 'http://localhost:9200';

let argv = process.argv.slice(2) || [];
let arg0 = argv[0] || '';
let _url = url.parse(arg0);
if (_url.host) {
    ELASTIC_BASEURL = `${_url.protocol}//${_url.host}`;
}

const app = express();

(async function () {

    let builder = new SchemaBuilder(ELASTIC_BASEURL);

    app.use('/graphql', graphqlHTTP({
        schema: await builder.build(),
        graphiql: true,
    }));
    console.log('Now browse to localhost:4000/graphql');
})().catch(e => console.log(e));

app.listen(4000, () => console.log('Server started'));
