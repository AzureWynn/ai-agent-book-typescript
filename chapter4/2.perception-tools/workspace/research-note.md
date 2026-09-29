# Research Note: Model Context Protocol

The Model Context Protocol (MCP) standardizes how AI models call external
tools. An MCP server exposes a tool list; an MCP client discovers tools,
validates arguments against each tool schema, and invokes them over a
transport such as stdio.

Perception tools only observe the world: they read files, search documents,
and query public data sources. They never change state, which makes them
safe to cache and run in parallel.

Key ideas: unified ActionResponse envelope, schema-first arguments, and
honest errors that distinguish empty results from failures.
