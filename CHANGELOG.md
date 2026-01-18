# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Suffix support for dynamic parameters**: Files like `get-[id]-resources.ts` are now correctly parsed as `GET /api/:id/resources`
- **HTTP method-only file names**: Files can now be named with just the HTTP method (e.g., `get.ts`, `post.ts`), and the route will be the directory path
- **Prefix array support**: `prefix` parameter now accepts string arrays for registering routes with multiple prefixes
- **Merged configuration support**: `autoRouter` now accepts an array of configurations for cleaner, more concise setup
- Multi-level configuration support: Multiple `autoRouter` instances can now be used with different configurations
- Each configuration maintains independent settings for `dir`, `prefix`, and `defaultRequiresAuth`
- Route metadata automatically accumulates across multiple configurations without overwriting
- Duplicate route detection now works across all configurations and instances
- Added comprehensive test cases for prefix arrays, merged and separate configuration scenarios

### Changed

- `autoRouter` function signature now supports both single object and array of objects
- `prefix` parameter now supports both string and string array types
- Route registry is now shared across all `autoRouter` configurations to prevent duplicate routes
- Updated README with prefix array examples and use cases
- Updated README with merged configuration examples (recommended approach)
- Added documentation for common scenarios using merged configuration: business modules, permission levels, and API versioning
- Updated example code to demonstrate merged configuration pattern

## [0.0.1] - 2025-11-08

### Initial Release

- Initial release of `@chaeco/hoa-auto-router`
- File-based automatic routing system for Hoa.js framework
- Support for nested directory structures
- Built-in permission metadata with `requiresAuth` support
- Dynamic parameter support using `[param]` syntax
- Duplicate route detection and validation
- TypeScript support with full type definitions
- Integration with `@chaeco/hoa-jwt-permission` for automatic permission checking
- Comprehensive test suite with Jest
- Example project demonstrating usage
- ESM module support
- Peer dependency on `hoa: ^0.3.0`
- Node.js >=16.0.0 requirement
- MIT License
- More configuration options
- Performance optimizations
- Extended documentation
