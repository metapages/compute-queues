import { useEffect, useRef } from "react";

import {
  convertJobOutputDataRefsToExpectedFormat,
  DataRef,
  DataRefType,
  DockerJobState,
  StateChangeValueFinished,
} from "/@shared/client";

import { isIframe, MetaframeInputMap } from "@metapages/metapage";
import { useMetaframeAndInput } from "@metapages/metapage-react";

import { getIOBaseUrl } from "../config";
import { useStore } from "../store";
import { useOptionResolveDataRefs } from "./useOptionResolveDataRefs";
import { useQueue } from "./useQueue";
import { DockerRunResultWithOutputs } from "/@shared/client";
import { useOptionAllowSetJob } from "./useOptionAllowSetJob";

const datarefKeyToUrl = async (ref: DataRef, baseUrl: string): Promise<DataRef> => {
  if (ref.type === DataRefType.key) {
    return {
      value: `${baseUrl}/api/v1/download/${ref.value}`,
      type: DataRefType.url,
    };
  } else {
    return ref;
  }
};

export const getJobUrl = (queue: string, jobId: string): string => {
  const ioBaseUrl = getIOBaseUrl(queue);
  return `${ioBaseUrl}/api/v1/job/${jobId}`;
};

const convertMetaframeOutputKeysToUrls = async (
  outputs: MetaframeInputMap,
  queue: string,
): Promise<MetaframeInputMap> => {
  const ioBaseUrl = getIOBaseUrl(queue);
  const newOutputs: MetaframeInputMap = {};
  for (const [key, _value] of Object.entries(outputs)) {
    newOutputs[key] = await datarefKeyToUrl(outputs[key], ioBaseUrl);
  }
  return newOutputs;
};

/**
 * Automatically send the finished job outputs to the metaframe
 */
export const useSendJobOutputs = () => {
  const { resolvedQueue } = useQueue();
  const [allowSetJob] = useOptionAllowSetJob();
  // You usually don't want this on, that means big blobs
  // are going to move around your system
  const [resolveDataRefs] = useOptionResolveDataRefs();
  const dockerJobServer = useStore(state => state.jobState);
  // track if we have sent the outputs for this job hash
  // this will be reset if the state isn't finished
  // e.g. if the job is restarted
  const jobHashOutputsLastSent = useRef<string | undefined>(undefined);

  const metaframeBlob = useMetaframeAndInput();
  useEffect(() => {
    // This is here but currently does not seem to work:
    // https://github.com/metapages/metapage/issues/117
    if (metaframeBlob?.metaframe) {
      metaframeBlob.metaframe.isInputOutputBlobSerialization = false;
    }
  }, [metaframeBlob?.metaframe]);

  // only maybe update metaframe outputs if the job updates and is finished (with outputs)
  useEffect(() => {
    const metaframeObj = metaframeBlob?.metaframe;

    if (
      !metaframeObj?.setOutputs ||
      !dockerJobServer ||
      dockerJobServer?.state !== DockerJobState.Finished ||
      !isIframe()
    ) {
      // this is like a reset
      jobHashOutputsLastSent.current = undefined;
      // console.log(`💔 useEffect not sending outputs because of conditions metaframeObj?.setOutputs=${metaframeObj?.setOutputs} dockerJobServer=${dockerJobServer} dockerJobServer?.state=${dockerJobServer?.state} isIframe=${isIframe()} `);
      return;
    }
    const stateFinished = dockerJobServer.value as StateChangeValueFinished;
    const result: DockerRunResultWithOutputs = stateFinished.result;
    if (!result) {
      // console.log(`💔 useEffect not sending outputs because result is undefined`);
      return;
    }

    if (jobHashOutputsLastSent.current === dockerJobServer.hash) {
      // console.log(`💔 NOT sending outputs to metaframe, did it already`);
      return;
    }

    const { outputs } = result;

    (async () => {
      const jobStatusJson = {};
      if (allowSetJob) {
        jobStatusJson["stdout"] = stateFinished?.result?.logs
          ?.filter(([_, __, isstderr]) => !isstderr)
          .map(log => {
            log[0] = log[0].trimEnd();
            return log;
          });
        jobStatusJson["stderr"] = stateFinished?.result?.logs
          ?.filter(([_, __, isstderr]) => isstderr)
          .map(log => {
            log[0] = log[0].trimEnd();
            return log;
          });
        jobStatusJson["statusCode"] = stateFinished?.result?.StatusCode;
        jobStatusJson["error"] = stateFinished?.result?.error;
        jobStatusJson["duration"] = stateFinished?.result?.duration;
        jobStatusJson["isTimedOut"] = stateFinished?.result?.isTimedOut;
        jobStatusJson["url"] = getJobUrl(resolvedQueue, dockerJobServer.hash);
      }

      if (resolveDataRefs) {
        // TODO: use a local cache to avoid re-downloading the same outputs
        // console.log(`💚 💖 Resolving data refs for metaframe`);
        const ioBaseUrl = getIOBaseUrl(resolvedQueue);
        const metaframeOutputs: MetaframeInputMap | undefined = await convertJobOutputDataRefsToExpectedFormat(
          outputs,
          ioBaseUrl,
        );

        const keysToUrlsOutputs = metaframeOutputs
          ? await convertMetaframeOutputKeysToUrls(metaframeOutputs, resolvedQueue)
          : metaframeOutputs;

        try {
          // previously we sent the job status code, logs etc, but just send the outputs
          // If you want to send the other stuff, you can on your own
          if (allowSetJob) {
            metaframeObj.setOutputs!({ ...keysToUrlsOutputs, "job/result.json": jobStatusJson });
          } else {
            metaframeObj.setOutputs!({ ...keysToUrlsOutputs });
          }
        } catch (err) {
          console.error("Failed to send metaframe outputs", err);
        }
        jobHashOutputsLastSent.current = dockerJobServer.hash;
      } else {
        // console.log(`💚 Sending outputs to metaframe`, outputs);
        const keysToUrlsOutputs = outputs ? await convertMetaframeOutputKeysToUrls(outputs, resolvedQueue) : outputs;
        // console.log(`💚💚 Sending outputs to metaframe keysToUrlsOutputs`, keysToUrlsOutputs);
        if (allowSetJob) {
          metaframeObj.setOutputs!({ ...keysToUrlsOutputs, "job/result.json": jobStatusJson });
        } else {
          metaframeObj.setOutputs!({ ...keysToUrlsOutputs });
        }
        jobHashOutputsLastSent.current = dockerJobServer.hash;
      }
    })();
  }, [allowSetJob, resolvedQueue, dockerJobServer, metaframeBlob?.metaframe]);
};
