# Run docker containers as metaframes in the browser

`docker.mtfm.io` runs docker containers on workers. It is currently in beta.

 - Run any publicly available docker image: `Python`, `R`, `C++`, `Java`, ... anything.
 - Bring your own workers
   - Currently individual machines are supported, but kubernetes and nomad support coming soon
 - Your queue is simply an unguessable hash. Do not share it without consideration.

Use cases:

 - machine learning pipelines
 - data analysis workflows

Any time the inputs change (and on start) the configured docker contaner is run:
 - `/inputs` is the location where inputs are copied as files
 - `/outputs`: any files here when the container exits are passed on as metaframe outputs


[![](https://mermaid.ink/svg/pako:eNqNkk9v2zAMxb8KoV5WwGnWdScVKFA0OezUQ3qLe1BsKlZtSZ5ENQ2SfPdRttM_u2yAAdPye-SPDzqIytcopNgG1TfwtCgdQNWpGBeowfYPvvMBtOk6eaG1LiIF36K8uLm-Xy5_Tp-znampkT_6t9vS5QYxbcZ-Fkn1aov5EGAT_C5iWJeiIeqjnM_P_-PV1lCTNlfGz2tftRhK8SylnABGexbroCz-cuv3GnZsBOP6RPGTA2azOzhO50Aexq7w4jfHM8cXqMngEw0OHbz94nkf-Jjo0_TKu5iscduz8y9qdPUQCIZXXnx8jcjcFX4nTPh8mxU7H9ohmrGAb6RajFkVISTnhhEO9j4F3oqHc_SpohRwXnnLkzFccma8xgyOE7ixHG0xZlAwHz_xOLHkmR-r_79nwstp8e6kjBuoP6JiiKzrjGtXtO8QvhfX8O9rIwphMVhlar6Mh9yhFNSgxVJILmvUKnVUitKdWJr6WhEua0M-CKlVF7EQimlXe1cJydHgWbQwiu-inVSnPyX5DNs)](https://mermaid-js.github.io/mermaid-live-editor/edit#pako:eNqNkk9v2zAMxb8KoV5WwGnWdScVKFA0OezUQ3qLe1BsKlZtSZ5ENQ2SfPdRttM_u2yAAdPye-SPDzqIytcopNgG1TfwtCgdQNWpGBeowfYPvvMBtOk6eaG1LiIF36K8uLm-Xy5_Tp-znampkT_6t9vS5QYxbcZ-Fkn1aov5EGAT_C5iWJeiIeqjnM_P_-PV1lCTNlfGz2tftRhK8SylnABGexbroCz-cuv3GnZsBOP6RPGTA2azOzhO50Aexq7w4jfHM8cXqMngEw0OHbz94nkf-Jjo0_TKu5iscduz8y9qdPUQCIZXXnx8jcjcFX4nTPh8mxU7H9ohmrGAb6RajFkVISTnhhEO9j4F3oqHc_SpohRwXnnLkzFccma8xgyOE7ixHG0xZlAwHz_xOLHkmR-r_79nwstp8e6kjBuoP6JiiKzrjGtXtO8QvhfX8O9rIwphMVhlar6Mh9yhFNSgxVJILmvUKnVUitKdWJr6WhEua0M-CKlVF7EQimlXe1cJydHgWbQwiu-inVSnPyX5DNs)

Versioned. Reproducible. No client install requirements, as long as you have at least one worker running somewhere, you can run any programming language.

## Getting started

1. Create a queue
   - Click the connect button in the top-left
   - A "queue" is simply string or key
   - The part of the URL that looks like `#?queue=my-queue-e7eebea2-c607-11ee-84de-b7a272dd08fc`
   - Best if the `queue` value is a long impossible to guess string e.g. a GUID
   - Workers point to this queue, and run the configured docker jobs
2. Configure the docker job
3. Run a worker (or a bunch):
   ```
   docker run --restart unless-stopped -tid -v /var/run/docker.sock:/var/run/docker.sock -v /tmp:/tmp metapage/metaframe-docker-worker:0.1.2 --cpus=2 --queue=public1
   ```

**Coming soon:** GPU support

## Repository
[https://github.com/metapages/metaframe-docker](https://github.com/metapages/metaframe-docker)


## Example URL

Run the python command in a container:

https://docker.mtfm.io/?command=cHJpbnQgXCggc2Rmc2RmMiBcKQ%3D%3D&image=python3#/queue/1?command=cHl0aG9uIC1jICdwcmludCgiaGVscCIpJw%253D%253D&image=python%253A3.8.8-alpine3.13&job=JTdCJTIyY29tbWFuZCUyMiUzQSUyMnB5dGhvbiUyMC1jJTIwJ3ByaW50KCU1QyUyMmhlbHAlNUMlMjIpJyUyMiUyQyUyMmltYWdlJTIyJTNBJTIycHl0aG9uJTNBMy4xMi4xLWFscGluZTMuMTklMjIlN0Q=&queue=public1