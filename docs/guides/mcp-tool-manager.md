# MCP Tool Manager - user guide

Settings -> MCP -> Tool Manager lets you give your AI agent extra tools without editing source code. A tool you create is a **web request** that King Browser sends for the agent when it uses the tool. There is no custom code: nothing you type is executed as a script.

## What you can see

The dashboard shows the number of tools (total, active, disabled, custom, built-in), a search box, a filter and a sort order. Each row shows the name, description, type (Built-in, or Custom with an `HTTP` badge), status, the result of the last test, and the actions you may use.

- **Built-in tools** (listed here with short descriptions; the former separate permissions list was merged into this dashboard) are King Browser's own functions (`browser_*`). You can switch them off, but you cannot delete them: they are part of the browser.
- **Custom tools** are yours. You can add, edit, test, switch off, export and delete them.
- A **disabled** tool is not listed to agents and is refused if an agent calls it anyway. This is enforced in the main process, not only in the interface.

## Add a tool

1. Choose **Add tool**.
2. Fill in the two main fields:
   - **Tool name**: lowercase letters, digits and underscores. King Browser adds the `custom_` prefix. The name must be unique.
   - **Tool description**: say what the tool does and when an agent should use it (30 to 1000 characters). Empty, filler or instruction-like text is rejected.
3. Open **Advanced configuration**. A name and a description alone do not make a working tool; the tool needs a request:
   - **Method and web address.** `https` only. Put `{parameter}` where the agent's input belongs in the path, for example `https://api.example.com/items/{id}`. The host cannot contain a parameter.
   - **Input parameters.** Name, type (string, number, integer, boolean), description, required or optional. They become the tool's input schema; the agent's arguments are checked against it on every call.
   - **Query parameters and static headers** (one per line). Values may use `{parameter}`.
   - **Request body** (POST, PUT, PATCH, DELETE): a JSON object. A value written as `"{id}"` is replaced by the argument.
   - **Authentication.** None, bearer token, or a custom header. The credential is stored encrypted in the main process, is never shown again, and is never sent to the page.
   - **Approval.** *Ask every time* (default) or *Automatic (read-only)*. Automatic is only offered for GET or HEAD requests without a credential, and strict approval mode still asks.
   - **Timeout** (1 to 30 s) and **maximum response size** (up to 1 MB).
4. **Save.** Every problem found is listed; nothing is saved until the definition is valid.

## Test a tool

**Test** asks you for sample arguments and sends a real request through the same approval step an agent would face. The dialog shows *Completed* only if the request completed with a successful HTTP status; a rejected approval, a timeout, a redirect or an HTTP error is shown as *Failed* with the reason. The credential is removed from any output.

## Edit a tool

Editing the description alone saves directly. If an edit changes what the tool can do (name, method, address, query, headers, body, authentication, approval policy, parameters, limits), King Browser lists the changes and asks you to confirm. Calls that are running under the old behaviour are cancelled. To keep the saved credential, leave the credential field empty; to remove it, tick *Remove the saved credential*.

## Disable or delete

- The switch disables a tool right away; a running call is cancelled.
- **Delete** asks for confirmation, cancels running calls, removes the saved credential and the definition, and appends a record (name, id, time; no secrets) to `mcp-custom-tools-audit.jsonl` in the profile folder.

## Export and import

- **Export** writes `king-browser-custom-tools.json` **without credentials**.
- **Import** shows a preview first (new, name already used, invalid) and changes nothing until you confirm. If any entry fails, nothing is imported. Tools that need a credential arrive disabled until you add it. Files over 512 KB or with more than 50 tools are refused.

## Limits and safety rules

- Only `https` addresses on public hosts. `localhost`, `.local`, `.internal`, private, link-local and loopback addresses (including ones a hostname resolves to) and King Browser's own MCP port are blocked. The connection is pinned to the address that was checked.
- Redirects are not followed; a redirect is reported as an error.
- At most 50 custom tools, 20 parameters per tool.
- Tool output is shown to the agent as external data. If it reads like instructions to an AI, the agent is warned and the next page action asks for approval.
- The run history records which argument names were used, not their values.

## Troubleshooting

| Symptom | Cause and fix |
| :--- | :--- |
| "The host and port of the URL cannot contain placeholders" | Move the parameter into the path or the query. |
| "Requests to private/internal IP addresses are blocked" | The host resolves to a non-public address. Use a public host. |
| "The server answered with a redirect" | Use the final address of the API. |
| "Custom tools require the approval policy to be enforced" | The app is running without its policy engine (a development setup). |
| A tool is missing from the agent's list | It is disabled, invalid (edit it), or the client has not refreshed `tools/list`. |
| Test says *Failed: rejected* | You rejected the approval dialog, or it timed out after 60 s. |
| A message appears in English in Arabic or German | It is a validator message without a translation rule yet; the meaning is unchanged. |

## Not supported

Connecting an external MCP server is not implemented yet, and exposing internal browser actions under a new name is deliberately refused; see `docs/engineering/custom-mcp-tools.md` for why.
