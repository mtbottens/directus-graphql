import { GraphQLServer } from 'graphql-yoga';
import { RemoteInstance } from 'directus-sdk-javascript';
import pluralize from 'pluralize';
import fetch from 'node-fetch';

const URL = process.env.GATSBY_DIRECTUS_URL || "nourl";
const TOKEN = process.env.GATSBY_DIRECTUS_ACCESS_TOKEN || "notoken";

const DIRECTUS_CLIENT = new RemoteInstance({ url: URL, accessToken: TOKEN, version: '1.1' });

/**
 * Gets Tables from Directus
 * 
 * @param accessToken | string
 * @param url | string
 * 
 * @returns DirectusTable[]
 */
const fetcher = async ( accessToken: string, url: string ) => {
    const client = DIRECTUS_CLIENT;

    // Fetch all tables
    const allTableData: DirectusFetchTablesResponse = await client.getTables({});
    allTableData.data.push({
        name: 'directus_files'
    });

    // Construct tables tableData 
    let currentTables: DirectusTable[] = [];
    await Promise.all(allTableData.data.map(async (table: DirectusFetchTable) => {
        const tableData: DirectusTableResponse = await client.getTable(table.name);
        currentTables.push(tableData.data);
    }));

    return currentTables;
};

/**
 * Capitalize first letter of the string
 * 
 * @param word | string
 * 
 * @returns string
 */
const capitalize = (word: string) =>
    word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Converts strings like hello_thing into helloThing
 * 
 * @param word | string
 * 
 * @returns string
 */
const toSnakeCase = (word: string) =>
    word.replace(/_(.)/g, (whole, part) => part.toUpperCase());

/**
 * Converts a singular column name into its plural camelcased counterpart
 * 
 * @param type | string
 */
const pluralizeType = (type: string) => {
    if (type.indexOf('_') !== -1) {
        let lastWord = type.split('_').pop();
        return type.replace(/_.*?$/, pluralize(lastWord));
    } else {
        return pluralize(type);
    }
}

/**
 * Converts a column name into graphql types
 * 
 * @param type | string
 * 
 * @returns string
 */
const convertToTypeDefs = (type: string) => 
    `${toSnakeCase(pluralizeType(type))}: [${capitalize(toSnakeCase(type))}!]!
    ${toSnakeCase(type)}(id: ID!): ${capitalize(toSnakeCase(type))}!`

/**
 * Lookup table to convert directus column types into graphql compatible scalar types
 */
const TYPE_MAP: any = {
    'INT': 'Int',
    'VARCHAR': 'String',
    'DATETIME': 'String',
    'TEXT': 'String',
    'BLOB': 'String',
    'TINYINT': 'Int',
    'DATE': 'String',
    'TIME': 'String',
};

/**
 * Tests to see if a column is a many to one relationship
 * 
 * @param column | DirectusColumn
 * 
 * @returns boolean
 */
const columnIsManyToOne = (column: DirectusColumn) =>
    column.relationship && column.relationship.related_table && column.relationship_type === 'MANYTOONE';

/**
 * Tests to see if a column is a many to many relationship
 * 
 * @param column | DirectusColumn
 * 
 * @returns boolean
 */
const columnIsManyToMany = (column: DirectusColumn) =>
    column.relationship && column.relationship.related_table && column.relationship_type !== 'MANYTOONE';

/**
 * Some shit code that needs to be refactored as its too complex. Used as a helper to generate the schema
 * 
 * @param table | any
 * @param relationsAsString | boolean
 * @param disableRequired | boolean
 * 
 * @returns string
 */
const getTypeDefsForTable = (table: DirectusTable, relationsAsString: boolean = false, disableRequired: boolean = false) => {
    let columnDefs = table.columns.data.map((columnData: DirectusColumn) => {
        if (columnData.column_name === 'id') {
            if (relationsAsString) {
                return '';
            }
            return `id: ID${disableRequired ? '' : '!'}`;
        }
        if ((columnIsManyToMany(columnData) || columnIsManyToOne(columnData)) && relationsAsString) {
            return `${columnData.column_name}: String${columnData.required && !disableRequired ? '!' : ''}`
        } else if (columnIsManyToOne(columnData)) {
            const relatedTable = columnData.relationship.related_table;

            return `${columnData.column_name}: ${capitalize(toSnakeCase(relatedTable))}${columnData.required && !disableRequired ? '!' : ''}`;
        } else if (columnIsManyToMany(columnData)) {
            const relatedTable = columnData.relationship.related_table;

            return `${columnData.column_name}: [${capitalize(toSnakeCase(relatedTable))}${columnData.required && !disableRequired ? '!' : ''}]${columnData.required && !disableRequired ? '!' : ''}`
        } else {
            if (!TYPE_MAP[columnData.type]) {
                console.log(`Failed to find type for ${table.name}.${columnData.name}[${columnData.type}]`);
            }
            return `${columnData.column_name}: ${TYPE_MAP[columnData.type]}${columnData.required && !disableRequired ? '!' : ''}`;
        }
    });

    // If table.name is directus_files, add the missing types from the storage adapter
    // TODO: Find a better way
    if (table.name === 'directus_files' && !relationsAsString && !disableRequired) {
        columnDefs.push(
            `html: String`,
            `old_thumbnail_url: String`,
            `thumbnail_url: String`,
            `url: String`
        );
    } else if (table.name === 'directus_files' && relationsAsString) {
        columnDefs.push(`data: String`);
    }

    return columnDefs;
};

/**
 * Creates an entity type string for a table for the graphql schema
 * 
 * @param table | DirectusTable
 * 
 * @returns string
 */
const createEntityDefForTable = (table: DirectusTable) => {
    return `type ${capitalize(toSnakeCase(table.name))} {
        ${getTypeDefsForTable(table).join('\n')}
    }`;
};

/**
 * Creates the mutation strings for a table for the graphql schema
 * 
 * @param table | DirectusTable
 * 
 * @returns string
 */
const createMutationsDefForTable = (table: DirectusTable) => 
    `create${capitalize(toSnakeCase(table.name))}(${getTypeDefsForTable(table, true)}): ${capitalize(toSnakeCase(table.name))}
    update${capitalize(toSnakeCase(table.name))}(id: ID!, ${getTypeDefsForTable(table, true, true)}): ${capitalize(toSnakeCase(table.name))}
    delete${capitalize(toSnakeCase(table.name))}(id: ID!): ${capitalize(toSnakeCase(table.name))}`;

/**
 * Starts the graphql server
 */
const startServer = async () => {
    // Fetch the tables
    const tables = await fetcher(TOKEN, URL);

    // Create the schema
    const typeDefs = `
        type Query {
            hello(name: String): String!
            ${tables.map(table => convertToTypeDefs(table.name))}
        }

        ${tables.map(table => createEntityDefForTable(table))}

        type Mutation {
            ${tables.map(table => createMutationsDefForTable(table))}
        }
    `

    /**
     * Resolvers stub to build out resolvers later by looping over the tables
     */
    const resolvers: any = {
        Query: {},
        Mutation: {}
    }

    /**
     * For each table, create the queries and mutations
     */
    for (const table of tables) {
        // Get rows query
        resolvers.Query[toSnakeCase(pluralizeType(table.name))] = () => {
            return new Promise((resolve, reject) => {
                fetch(`${URL}/api/1.1/tables/${table.name}/rows?access_token=${TOKEN}`).then((res: any) => 
                    res.json().then((json: DirectusTableResponse) => {
                        resolve(json.data);
                    }).catch(reject)
                ).catch(reject);
            });
        };

        // Get single query
        resolvers.Query[toSnakeCase(table.name)] = (parent: any, args: any) => {
            const { id } = args;
            return new Promise((resolve, reject) => {
                fetch(`${URL}/api/1.1/tables/${table.name}/rows/${id}?access_token=${TOKEN}`).then((res: any) => 
                    res.json().then((json: DirectusTableResponse) => {
                        resolve(json.data);
                    }).catch(reject)
                ).catch(reject);
            });
        };

        // Get row query alias (relational) data
        for (const columnData of table.columns.data) {
            if (columnIsManyToOne(columnData) || columnIsManyToMany(columnData)) {
                const query = capitalize(toSnakeCase(table.name));
                const columnName = columnData.column_name;
                const relatedTable = columnData.related_table;

                if (!resolvers[query]) {
                    resolvers[query] = {};
                }

                resolvers[query][columnName] = (parent: any) => {
                    let relatedIds: any;
                    let query: string;

                    if (columnIsManyToOne(columnData)) {
                        relatedIds = parent[columnName].data.id;
                        query = `${URL}/api/1.1/tables/${columnData.related_table}/rows/?id=${relatedIds}&access_token=${TOKEN}`;
                    } else {
                        relatedIds = parent[columnName].data.map((row: any) => row.id);
                        query = `${URL}/api/1.1/tables/${columnData.related_table}/rows/?ids=${relatedIds.join(',')}&access_token=${TOKEN}`;
                    }

                    console.log(query);

                    return new Promise((resolve, reject) => {
                        fetch(query).then((res: any) => 
                            res.json().then((json: DirectusTableResponse) => {
                                resolve(json.data);
                            }).catch(reject)
                        ).catch(reject);
                    });
                };
            }
        }

        // Mutations! CREATE|UPDATE|DESTROY only, reading is done in queries ya dumb dumb
        resolvers.Mutation[`create${capitalize(toSnakeCase(table.name))}`] = (parent: any, args: any) => {
            let query: string;

            if (table.name === 'directus_files') {
                query = `${URL}/api/1.1/files`;
            } else {
                query = `${URL}/api/1.1/tables/${table.name}/rows`;
            }

            return new Promise((resolve, reject) => {
                fetch(query, {
                    method: 'post',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(args)
                }).then((resp: any) => resp.json().then((json: DirectusTableResponse) => {
                    resolve(json.data)
                })).catch(reject);
            });
        };

        resolvers.Mutation[`update${capitalize(toSnakeCase(table.name))}`] = (parent: any, args: any) => {
            let query: string;

            const { id } = args;
            delete args.id;

            if (table.name === 'directus_files') {
                query = `${URL}/api/1.1/files/${id}`;
            } else {
                query = `${URL}/api/1.1/tables/${table.name}/rows/${id}`;
            }

            return new Promise((resolve, reject) => {
                fetch(query, {
                    method: 'put',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(args)
                }).then((resp: any) => resp.json().then((json: DirectusTableResponse) => {
                    resolve(json.data)
                })).catch(reject);
            });
        };

        resolvers.Mutation[`delete${capitalize(toSnakeCase(table.name))}`] = (parent: any, args: any) => {
            const { id } = args;
            return new Promise((resolve, reject) => {
                fetch(`${URL}/api/1.1/tables/${table.name}/rows/${id}`, {
                    method: 'delete',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }).then((resp: any) => resp.json().then((json: DirectusTableResponse) => {
                    resolve(json.data)
                })).catch(reject);
            });
        };
    }

    // Typedefs and resolvers are ready, create and start the server
    const server = new GraphQLServer({ typeDefs, resolvers })
    server.start(() => console.log('Server is running on localhost:4000'))
};

startServer();