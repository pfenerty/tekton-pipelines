package templates

import (
	tektonv1 "triggers.tekton.dev/triggertemplate/v1beta1"
)

templateParams: [
    {name: "gitrevision", description: "git revision to clone" },
    {name: "gitrepositoryurl", description: "git repository url"},
    {name:"project-name", description:  "project name"},
    {name:"namespace",description: "namespace"}
]

pipelineRunParams: [
    {name: "git-revision", value: "$(tt.params.gitrevision)"},
    {name: "git-url", value: "$(tt.params.gitrepositoryurl)"},
    {name: "app-root", value: #config.pipeline.appRoot},
    {name: "build-path", value: #config.pipeline.buildPath}
]

pipelineRunWorkspace: [
	{
		name: "filesystem"
		volumeClaimTemplate: {
			spec: {
				accessModes: ["ReadWriteOnce"]
				resources: {
					requests: {
						storage: #config.pipeline.workspaceStorage
					}
				}
			}
		}
	}
]

#TriggerTemplate: tektonv1.#TriggerTemplate & {
	#config:    #Config
	apiVersion: "triggers.tekton.dev/v1beta1"
	kind:       "TriggerTemplate"
	metadata:   {
	    namespace: #config.metadata.namespace
	    name: #config.metadata.name + "-go-build"
	    labels: #config.metadata.labels
	    annotations: #config.metadata.annotations
	}
	spec: {
		params: templateParams
		resourceTemplates: [
			{
				apiVersion: "tekton.dev/v1beta1"
				kind: "PipelineRun"
				metadata: #config.metadata
				spec: {
					params: pipelineRunParams
					pipelineRef: {name: "go-build"}
					serviceAccountName: #config.metadata.name
					workspaces: pipelineRunWorkspace
				}
			}
		]
	}
}
