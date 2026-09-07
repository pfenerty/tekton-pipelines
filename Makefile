.PHONY: install synth synth-ci check-ci graph clean

## Install Node.js dependencies
install:
	flox activate -- npm install

## Synthesize the example PAC artifacts (PipelineRun templates + tasks/) into .tekton/
synth:
	flox activate -- npm run synth

## Synthesize the self-CI PAC artifacts into .tektonic/
synth-ci:
	flox activate -- npm run build
	flox activate -- node dist/cli/index.js synth examples/self-ci.ts

## Fail if the committed .tektonic/ output is stale, missing or orphaned
check-ci:
	flox activate -- npm run build
	flox activate -- node dist/cli/index.js check examples/self-ci.ts

## Print the self-CI task DAG (FORMAT=mermaid for a flowchart)
graph:
	flox activate -- npm run build
	flox activate -- node dist/cli/index.js graph examples/self-ci.ts --format $(or $(FORMAT),text)

## Remove compiled output
clean:
	rm -rf synth-output/ dist/
