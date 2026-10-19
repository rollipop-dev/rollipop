# Contributing to Rollipop

Thank you for your interest in contributing to Rollipop!

We welcome contributions from the community and appreciate your efforts to help improve this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Help](#getting-help)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Testing the CLI](#testing-the-cli)
- [Code Quality Checks](#code-quality-checks)
- [Pull Request Process](#pull-request-process)
- [Commit Message Guidelines](#commit-message-guidelines)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [dev.ghlee@gmail.com](mailto:dev.ghlee@gmail.com).

## Getting Help

If you have questions about the project or need help getting started, please use our [GitHub Discussions](https://github.com/rollipop-dev/rollipop/discussions) page. This is the best place to ask questions, share ideas, and engage with the community.

## How to Contribute

There are many ways to contribute to Rollipop:

- **Report bugs**: If you find a bug, please [open an issue](https://github.com/rollipop-dev/rollipop/issues/new) with a clear description and reproduction steps.
- **Suggest features**: Have an idea for a new feature? Start a discussion or open an issue to share your thoughts.
- **Improve documentation**: Help us improve our docs by fixing typos, adding examples, or clarifying instructions.
- **Submit pull requests**: Fix bugs, add features, or improve existing code.

## Development Setup

Rollipop uses [mise](https://mise.jdx.dev/) to manage Node.js version, ensuring consistent development environments across the team.

1. **Set up the project**:

   ```bash
   mise trust
   mise install
   ```

2. **Install dependencies**:

   ```bash
   yarn install
   ```

3. **Build all packages**:
   ```bash
   yarn build:all
   ```

## Testing the CLI

### Building the package

Before testing CLI commands, you need to build the package:

```bash
yarn workspace rollipop build
```

### Running CLI Commands

After building the package, you can execute commands using:

```bash
yarn workspace rollipop run execute <command> [options]
```

### Testing Core Features

To test critical features like starts dev server and builds, use the test project:

```bash
cd examples/0.84
yarn rollipop <command> [options]
```

This provides a real-world environment for testing your changes.

## Code Quality Checks

Before submitting a pull request, ensure your code passes all quality checks. Run these commands locally to catch issues early.

### TypeScript

- **Lint check**:

  ```bash
  yarn lint
  ```

- **Lint and auto-fix**:

  ```bash
  yarn lint:fix
  ```

- **Type checking**:
  ```bash
  yarn typecheck:all
  ```

## Pull Request Process

1. **Fork repository**

2. **Make your changes**: Implement your bug fix, feature, or improvement.

3. **Test locally**: Run all code quality checks mentioned above to ensure everything passes.

4. **Commit your changes**: Follow our [commit message guidelines](#commit-message-guidelines).

5. **Push and open a pull request**: Push your branch and open a PR against the `main` branch.

6. **CI approval**: After you open a PR, a maintainer will approve the CI workflow to run automated tests.

7. **CI validation**: The CI workflow will run all quality checks, build processes, and end-to-end tests. All checks must pass before your PR can be merged.

### Important Notes

- Make sure to run all quality checks locally before opening a PR. This speeds up the review process and reduces CI failures.
- The CI runs comprehensive validation including builds and E2E tests that verify the entire system works correctly.
- Address all feedback from maintainers promptly and update your PR as needed.

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This helps us maintain a clear and consistent project history.

### Format

```
<type>: <description>

[optional body]

[optional footer]
```

---

Thank you for contributing to Rollipop! Your efforts help make this project better for everyone.
