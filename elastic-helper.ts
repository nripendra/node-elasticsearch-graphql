import fetch from 'node-fetch';

export async function getAllIndices(baseUrl: string) {
    const url = `${baseUrl}/_cat/indices?h=index,store.size,health&bytes=k&format=json`;
    let response = await fetch(url);
    return await response.json() as { index: string }[];
}

export async function getMappingInfo(baseUrl: string, indexName: string) {
    let mappingsInfo = await (await fetch(`${baseUrl}/${indexName}/_mapping`)).json();
    return mappingsInfo[indexName];
}

export function indexSearchResolver(baseUrl: string, indexName: string, typeName: string) {
    return async function(root: any, args: any, context: any, info: any) {
        args = args || {};
        context = context || {};
        info = info || {};
        args.search = args.search || { query: { match_all: {} } };

        let search = args.search;
        let path = resolveIndexPath(indexName, typeName);
        let data = await (await fetch(`${baseUrl}/${path}_search`, {
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            body: JSON.stringify(search)
        })).json();
        return {
            from: args.search.from,
            size: args.search.size,
            hitCount: data.hits.hits.length,
            totalCount: data.hits.total,
            items: data.hits.hits.map(hit => hit._source)
        };
    };
}

export function indexGetResolver(baseUrl: string, indexName: string, typeName: string) {
    return async function(root: any, args: any, context: any, info: any) {
        console.log('resolving');
        args = args || {};
        context = context || {};
        info = info || {};
        let id = args.id;
        // throw exception if no id??
        let path = resolveIndexPath(indexName, typeName);
        let data = await (await fetch(`${baseUrl}/${path}_search?q=_id:${id}`)).json();

        let result = data.hits.hits.map(hit => hit._source)[0];
        if (!result) {
            throw new Error('No such data found');
        }
        return result;
    };
}

function resolveIndexPath(indexName: string, typeName: string) {
    typeName = (typeName || '').trim();
    return indexName + '/' + ((typeName !== 'logs' && typeName) ? `_${typeName}/` : '');
}
