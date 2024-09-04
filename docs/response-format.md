# Response Format

All responses are in JSON format.

## Success Response

Success responses are returned with a 2xx status code.
`data` field contains the response data it can be either an object or an array.

`timestamp` field contains the timestamp of the response in milliseconds. If response is cached, it will contain the timestamp of the cached response.

Response can also contain `next` field for [pagination](pagination.md).

```json
{
  "data": {
    "message": "Success message"
  },
  "timestamp": 1630000000
}
```

## Error Response

Error responses are returned with a 4xx or 5xx status code.
Error message are returned in the `error` field.
`type` field contains type of error.

```json
{
  "type": "General",
  "error": "Resource not found"
}
```

## Validation Error Response

Validation errors are returned with a 422 status code.

`error` field contains the first validation error message.

`errors` field contains an array of all validation error messages for the request.

```json
{
  "type": "Validation",
  "error": "name is required",
  "errors": [
    "name is required",
    "type must be a string"
  ]
}
```
