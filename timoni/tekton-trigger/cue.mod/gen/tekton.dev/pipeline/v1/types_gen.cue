// Code generated by timoni. DO NOT EDIT.

//timoni:generate timoni vendor crd -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

package v1

import "strings"

#Pipeline: {
	apiVersion: "tekton.dev/v1"
	kind:       "Pipeline"
	metadata!: {
		name!: strings.MaxRunes(253) & strings.MinRunes(1) & {
			string
		}
		namespace!: strings.MaxRunes(63) & strings.MinRunes(1) & {
			string
		}
		labels?: {
			[string]: string
		}
		annotations?: {
			[string]: string
		}
	}
	...
}
