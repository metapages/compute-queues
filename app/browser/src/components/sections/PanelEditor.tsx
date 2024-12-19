import React, { useCallback, useEffect, useRef, useState } from "react";

import { PanelContainer } from "/@/components/generic/PanelContainer";
import { PanelHeader } from "/@/components/generic/PanelHeader";
import { encodeOptions } from "/@/helpers";
import { JobInputs } from "@metapages/compute-queues-shared";
import { useStore } from "/@/store";

import { useHashParamJson } from "@metapages/hash-query/react-hooks";
import { MetaframeStandaloneComponent } from "@metapages/metapage-react";

export const PanelEditor: React.FC = () => {
  const [value, setValue] = useState(null);
  const [jobInputs, setJobInputs] = useHashParamJson<JobInputs | undefined>(
    "inputs",
  );
  const mainInputFile = useStore((state) => state.mainInputFile);
  const setMainInputFileContent = useStore((state) =>
    state.setMainInputFileContent
  );

  // clear the main input file content on unmount
  useEffect(() => {
    return () => {
      setMainInputFileContent(null);
    };
  }, [setMainInputFileContent]);

  const options = useRef("");

  useEffect(() => {
    if (!mainInputFile) return;
    const fileExtension = mainInputFile.split(".").pop();
    options.current = encodeOptions({
      autosend: true,
      hidemenuififrame: true,
      mode: fileExtension || "sh",
      theme: "mf-default",
    });
    setValue(jobInputs[mainInputFile]);
  }, [jobInputs, mainInputFile]);

  const updateInput = useCallback(
    (content: string) => {
      const newJobInputsBlob = { ...jobInputs };
      newJobInputsBlob[mainInputFile] = content;
      setJobInputs(newJobInputsBlob);
    },
    [jobInputs, setJobInputs, mainInputFile],
  );

  const onSave = useCallback(() => {
    updateInput(value);
    setMainInputFileContent(null);
  }, [value, updateInput]);

  const onOutputs = useCallback(
    // eslint-disable-next-line
    (outputs: any) => {
      if (outputs["text"] === undefined || outputs["text"] === null) {
        return;
      }
      const newValue = outputs["text"];
      if (jobInputs?.[mainInputFile] === newValue) {
        return;
      }
      setValue(newValue);
      setMainInputFileContent(newValue);
    },
    [mainInputFile, jobInputs, setMainInputFileContent],
  );
  if (!options.current) return <></>;
  return (
    <PanelContainer>
      <PanelHeader title={mainInputFile} preserveCase={true} onSave={onSave} />
      <div
        style={{ height: "100%", width: "100%", position: "relative" }}
        id={"mf-editor"}
      >
        <MetaframeStandaloneComponent
          url={`https://editor.mtfm.io/#?hm=disabled&options=${options.current}`}
          inputs={{ text: value }}
          onOutputs={onOutputs}
        />
      </div>
    </PanelContainer>
  );
};
