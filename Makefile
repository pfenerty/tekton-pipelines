.PHONY: install synth diff apply clean

## Install Node.js dependencies
install:
	npm install

## Synthesize Kubernetes manifests into dist/
synth:
	npm run synth

## Dry-run diff against the current cluster state
## Requires: kubectl configured, Tekton installed in $(NAMESPACE)
NAMESPACE ?= tekton-builds
diff: synth
	kubectl diff -f dist/ --namespace=$(NAMESPACE)

## Apply all synthesized manifests to the cluster
apply: synth
	kubectl apply -f dist/

## Remove synthesized manifests
clean:
	rm -rf dist/
