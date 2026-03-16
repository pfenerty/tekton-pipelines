.PHONY: install synth diff apply clean

## Install Node.js dependencies
install:
	flox activate -- npm install

## Synthesize Kubernetes manifests into synth-output/
synth:
	flox activate -- npm run synth

## Dry-run diff against the current cluster state
## Requires: kubectl configured, Tekton installed in $(NAMESPACE)
NAMESPACE ?= tekton-builds
diff: synth
	kubectl diff -f synth-output/ --namespace=$(NAMESPACE)

## Apply all synthesized manifests to the cluster
apply: synth
	kubectl apply -f synth-output/

## Remove synthesized manifests and compiled output
clean:
	rm -rf synth-output/ dist/
