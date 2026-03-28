.PHONY: install synth synth-ci diff apply clean

## Install Node.js dependencies
install:
	flox activate -- npm install

## Synthesize Kubernetes manifests into synth-output/
synth:
	flox activate -- npm run synth
	@printf 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n' > synth-output/kustomization.yaml
	@for f in synth-output/*.k8s.yaml; do printf '  - %s\n' "$$(basename $$f)"; done >> synth-output/kustomization.yaml

## Synthesize self-CI pipeline into .tektonic/
synth-ci:
	flox activate -- npx ts-node examples/self-ci.ts
	@printf 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n' > .tektonic//kustomization.yaml
	@for f in .tektonic//*.k8s.yaml; do printf '  - %s\n' "$$(basename $$f)"; done >> .tektonic//kustomization.yaml

## Dry-run diff against the current cluster state
## Requires: kubectl configured, Tekton installed in $(NAMESPACE)
NAMESPACE ?= tekton-builds
diff: synth
	kubectl diff -k synth-output/ --namespace=$(NAMESPACE)

## Apply all synthesized manifests to the cluster
apply: synth
	kubectl apply -k synth-output/

## Remove synthesized manifests and compiled output
clean:
	rm -rf synth-output/ dist/
