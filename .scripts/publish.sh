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

# Publish packages
yarn workspaces foreach --all --no-private exec yarn npm publish --provenance --access public --tolerate-republish --tag "$publish_tag"
