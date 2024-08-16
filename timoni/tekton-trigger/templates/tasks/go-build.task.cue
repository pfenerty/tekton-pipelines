package tasks

import (
	tektonv1 "tekton.dev/task/v1"
)

#GoBuildTask: tektonv1.#Task & {
	#config:    #Config
	apiVersion: "triggers.tekton.dev/v1beta1"
	kind:       "TriggerTemplate"
	metadata:   #config.metadata
	spec: {
		apiVersion: "tekton.dev/v1"
		kind: "Task"
		spec: {
			params: [
				{
					name: #config.paramaterNames.
					description: ""
					type: "string"
					default: ""
				},
				{
					name: "golang-version"
					description: ""
					type: "string"
					default: ""
				},
				{
					name: "build-path"
					description: ""
					type: "string"
					default: ""
				}
			]
		}
	}
}
