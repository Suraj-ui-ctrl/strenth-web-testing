const { app } = require('@azure/functions');

const BACKEND = 'https://bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io';

app.http('proxy', {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: '{*route}',
    handler: async (request, context) => {
        const route = context.bindingData.route ?? '';
        const search = new URL(request.url).search;
        const targetUrl = `${BACKEND}/api/${route}${search}`;

        const headers = {};
        request.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'host') headers[key] = value;
        });

        let body;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            body = await request.arrayBuffer();
        }

        const upstream = await fetch(targetUrl, { method: request.method, headers, body });
        const responseBuffer = await upstream.arrayBuffer();

        const responseHeaders = {};
        upstream.headers.forEach((value, key) => { responseHeaders[key] = value; });

        return { status: upstream.status, headers: responseHeaders, body: responseBuffer };
    },
});
