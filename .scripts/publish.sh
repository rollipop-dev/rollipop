#!/bin/bash

set -e

version=$(jq -r '.version' packages/rollipop/package.json)

if [ -z "$1" ]; then
  case "$version" in
    *-alpha|*-alpha.*) publish_tag="alpha" ;;
    *-beta|*-beta.*) publish_tag="beta" ;;
    *-rc|*-rc.*) publish_tag="rc" ;;
    *-dev|*-dev.*) publish_tag="dev" ;;
    *-*) publish_tag="next" ;;
    *) publish_tag="latest" ;;
  esac
else
  publish_tag=$1
fi

echo "Publishing with tag: $publish_tag"

# Publish @rollipop/*
yarn workspaces foreach --all --no-private --include="@rollipop/*" exec yarn npm publish --provenance --access public --tolerate-republish --tag "$publish_tag"

# FIXME
# When deploying with yarn workspaces foreach, an OIDC authentication error occurs only in the `rollipop` package.
# Therefore, as a temporary measure, this package will be deployed separately using the npm command.
if ! yarn npm info "rollipop@$version" --fields version --json | jq -r '.version' | grep -Fxq "$version"; then
  yarn workspace rollipop pack --out package.tgz
  npm publish packages/rollipop/package.tgz --tag "$publish_tag" --provenance
else
  echo "rollipop@$version is already published"
fi
