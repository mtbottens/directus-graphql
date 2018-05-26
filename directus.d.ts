declare module 'directus-sdk-javascript';
declare module 'pluralize';
declare module 'node-fetch';

interface DirectusMetaData {
    table: string,
    type: string
}

interface DirectusRelationship {
    junction_key_left: string,
    junction_key_right: string,
    junction_table: any,
    related_table: string,
    type: string
}

interface DirectusColumn {
    column_name: string,
    column_type: string,
    comment: string,
    default_value: any,
    extra: string,
    extra_options: any[],
    hidden_input: boolean,
    id: string,
    junction_key_left: any,
    junction_key_right: any,
    junction_table: any,
    key: string,
    length: number,
    name: string,
    nullable: boolean
    options: any[],
    precision: number
    related_table: string,
    relationship: DirectusRelationship,
    relationship_type: string,
    required: boolean,
    scale: number,
    sort: number,
    system: boolean,
    table_name: string,
    type: string,
    ui: string
}

interface DirectusColumns {
    data: DirectusColumn[],
    meta: DirectusMetaData
}

interface DirectusTable {
    allowed_listing_views: any,
    column_groupings: any,
    columns: any,
    comment: string,
    created_at: string,
    date_create_column: any,
    date_created: any,
    date_update_column: any,
    display_status: string,
    display_template: string,
    filter_column_blacklist: any,
    footer: boolean,
    hidden: boolean,
    id: string,
    name: string,
    preferences: any,
    preview_url: string,
    primary_column: string,
    row_count: string,
    schema: string,
    single: boolean,
    sort_column: string,
    status_column: any,
    status_mapping: any,
    table_name: string,
    user_create_column: any,
    user_update_column: any
}

interface DirectusTableResponse {
    data: DirectusTable,
    meta: DirectusMetaData,
    success: boolean
}

interface DirectusFetchTable {
    name: string
}

interface DirectusFetchTablesResponse {
    data: DirectusFetchTable[],
    meta: DirectusMetaData
}
