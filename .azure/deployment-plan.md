# Deployment Plan

Status: Draft

## Objective

Deploy the current React/Vite frontend to the existing Azure Container Apps URL:

https://strenth-web.jollyfield-91f54af9.centralindia.azurecontainerapps.io/

Also raise a GitHub PR for the BOM parsing/RFQ classification fix if a Git repository and remote are available.

## Current Findings

- Application type: React/Vite single-page app.
- Packaging: Dockerfile exists at the project root.
- Existing backend API default: `VITE_BOM_API_URL=https://bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io`.
- Current workspace is not a Git checkout: `.git` is missing, so PR creation is blocked until a Git remote/branch is available.
- No `azure.yaml`, `infra/`, or existing deployment automation is present in this folder.

## Planned Steps

1. Verify local build.
2. Verify Azure/GitHub CLI availability and authentication.
3. Identify the existing Azure Container App, registry/image source, and resource group.
4. Build and push the updated container image using the existing Dockerfile.
5. Update the existing Container App revision to use the new image.
6. Verify the live URL after deployment.
7. Raise a GitHub PR if this folder is connected to a repository, or report the exact missing remote/repo requirement.

## Approval Required

Before deployment execution, confirm the Azure subscription/resource group/container registry or provide permission to discover them via Azure CLI.
