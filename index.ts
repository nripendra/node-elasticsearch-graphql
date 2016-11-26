import * as express from 'express';
import * as graphqlHTTP from 'express-graphql';
import * as url from 'url';
import { SchemaBuilder } from './SchemaBuilder';

let ELASTIC_BASEURL = 'http://localhost:9200';
let PORT = 4000;

let argv = process.argv.slice(2) || [];
let arg0 = argv[0] || '';
let _url = url.parse(arg0);
if (_url.host) {
    ELASTIC_BASEURL = `${_url.protocol}//${_url.host}`;
}

let arg1 = parseInt(argv[1] || '', 10);
if (arg1 > 0) {
    PORT = arg1;
}

const app = express();

(async function() {

    let builder = new SchemaBuilder(ELASTIC_BASEURL);

    app.use('/graphql', graphqlHTTP({
        schema: await builder.build(),
        graphiql: true,
    }));
    console.log('Now browse to http://localhost:${PORT}/graphql');
})().catch(e => console.log(e));

app.listen(PORT, () => console.log('Server started at ${PORT}'));
