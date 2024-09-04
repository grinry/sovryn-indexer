# Pagination

The API supports pagination for most endpoints that return a list of items.

Our pagination is based on the [cursor-based pagination](https://www.sitepoint.com/paginating-real-time-data-cursor-based-pagination/) method.

## Request Parameters

- `limit` - The number of items to return per page. Default is 10.
- `next` - The cursor to start from. This is returned in the `next` field of the response.

## Response Format

The response will contain a `next` field with the cursor to the next page.

```json
{
  "data": [
    {
      "id": 1,
      "name": "Item 1"
    },
    {
      "id": 2,
      "name": "Item 2"
    }
  ],
  "next": "eyJpZCI6Mn0=",
  "timestamp": 1630000000
}
```

## Cursor

The cursor is a base64 encoded string that contains the last item's id and other information needed to fetch the next page.

The cursor is returned in the `next` field of the response.
