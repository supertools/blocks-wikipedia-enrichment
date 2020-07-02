import {Box, Button, FormField, initializeBlock, Input, Label, Loader, useBase, useRecords} from '@airtable/blocks/ui';
import React, {Fragment, useState} from 'react';

// These values match the base for this example: https://airtable.com/shrIho8SB7RhrlUQL
const TABLE_NAME = 'Urls';
const URL_FIELD_NAME = 'URL';
const SUMMARY_FIELD_NAME = 'Summary';

const MAX_RECORDS_PER_UPDATE = 50;

const API_ENDPOINT = 'https://api.smmry.com/';
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/'

function TLDRBlock() {
    const base = useBase();

    const table = base.getTableByName(TABLE_NAME);
    const titleField = table.getFieldByName(URL_FIELD_NAME);

    // load the records ready to be updated
    // we only need to load the word field - the others don't get read, only written to.
    const records = useRecords(table, {fields: [titleField]});

    // keep track of whether we have up update currently in progress - if there is, we want to hide
    // the update button so you can't have two updates running at once.
    const [isUpdateInProgress, setIsUpdateInProgress] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [numOfSentences, setNumOfSentences] = useState('');
    const [invalidApi, setInvalidApi] = useState(false);

    // check whether we have permission to update our records or not. Any time we do a permissions
    // check like this, we can pass in undefined for values we don't yet know. Here, as we want to
    // make sure we can update the summary and image fields, we make sure to include them even
    // though we don't know the values we want to use for them yet.
    const permissionCheck = table.checkPermissionsForUpdateRecord(undefined, {
        [SUMMARY_FIELD_NAME]: undefined,
    });

    async function onButtonClick() {
        setIsUpdateInProgress(true);
        const recordUpdates = await getSummariesAsync(table, titleField, records, apiKey, numOfSentences, setInvalidApi);
        await updateRecordsInBatchesAsync(table, recordUpdates);
        setIsUpdateInProgress(false);
    }

    return (
        <Box
            // center the button/loading spinner horizontally and vertically.
            position="absolute"
            top="0"
            bottom="0"
            left="0"
            right="0"
            display="flex"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
        >
            {isUpdateInProgress ? (
                <Loader/>
            ) : (
                <Fragment>
                    <Box>
                        <FormField label="SMMRY API Key">
                            <Input value={apiKey} onChange={e => setApiKey(e.target.value)}
                                   placeholder={"https://smmry.com/"}/>
                        </FormField>
                        <FormField label="Num of Sentences">
                            <Input value={numOfSentences} onChange={e => setNumOfSentences(e.target.value)}
                                   placeholder="1 - 7"/>
                        </FormField>
                        {
                            invalidApi ?
                                <Box>
                                    <Label size="small" style={{'color': 'red'}} >
                                        Invalid API Key
                                    </Label>
                                </Box>
                                : null
                        }
                    </Box>
                    <Button
                        variant="primary"
                        onClick={onButtonClick}
                        disabled={!permissionCheck.hasPermission || !apiKey}
                        marginBottom={3}
                    >
                        TL;DR
                    </Button>
                    {!permissionCheck.hasPermission &&
                    // when we don't have permission to perform the update, we want to tell the
                    // user why. `reasonDisplayString` is a human-readable string that will
                    // explain why the button is disabled.
                    permissionCheck.reasonDisplayString}
                </Fragment>
            )}
        </Box>
    );
}

async function getSummariesAsync(table, titleField, records, apiKey, numOfSentences, setInvalidApi) {
    const recordUpdates = [];
    for (const record of records) {
        // for each record, we take the article title and make an API request:
        const url = record.getCellValueAsString(titleField);
        const requestUrl = `${CORS_PROXY}${API_ENDPOINT}&SM_API_KEY=${apiKey}` +
            `&SM_LENGTH=${numOfSentences ? numOfSentences : 7}&SM_URL=${url}`;
        const response = await fetch(requestUrl);
        const pageSummary = await response.json();

        if (pageSummary.sm_api_message === "INVALID API KEY") {
            setInvalidApi(true);
            return;
        }

        setInvalidApi(false);

        recordUpdates.push({
            id: record.id,
            fields: {
                [SUMMARY_FIELD_NAME]: pageSummary.sm_api_content
            },
        });
    }

    return recordUpdates;
}

async function updateRecordsInBatchesAsync(table, recordUpdates) {
    // Fetches & saves the updates in batches of MAX_RECORDS_PER_UPDATE to stay under size limits.
    if (recordUpdates) {
        let i = 0;
        while (i < recordUpdates.length) {
            const updateBatch = recordUpdates.slice(i, i + MAX_RECORDS_PER_UPDATE);
            // await is used to wait for the update to finish saving to Airtable servers before
            // continuing. This means we'll stay under the rate limit for writes.
            await table.updateRecordsAsync(updateBatch);
            i += MAX_RECORDS_PER_UPDATE;
        }
    }
}

initializeBlock(() => <TLDRBlock/>);
