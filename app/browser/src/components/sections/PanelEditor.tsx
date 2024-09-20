import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { PanelContainer } from '/@/components/generic/PanelContainer';
import { PanelHeader } from '/@/components/generic/PanelHeader';
import {
  encodeOptions,
  JobInputs,
} from '/@/shared';
import { useStore } from '/@/store';

import { useHashParamJson } from '@metapages/hash-query';
import { MetaframeStandaloneComponent } from '@metapages/metapage-embed-react';

export const PanelEditor: React.FC = () => {
  const [value, setValue] = useState(null);
  const [jobInputs, setJobInputs] = useHashParamJson<JobInputs | undefined>(
    "inputs"
  );
  const mainInputFile = useStore((state) => state.mainInputFile);
  const setMainInputFileContent = useStore((state) => state.setMainInputFileContent);
  
  // clear the main input file content on unmount
  useEffect(() => {
    return () => {
      setMainInputFileContent(null);
    }
  }, [setMainInputFileContent]);
  
  const options = useRef('')

  useEffect(() => {
    if (!mainInputFile) return;
    const fileExtension = mainInputFile.split('.').pop();
    options.current = encodeOptions({
      autosend: true, 
      hidemenuififrame: true, 
      mode: fileExtension || 'sh', 
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
    [jobInputs, setJobInputs, mainInputFile]
  );

  const onSave = useCallback(() => {
    updateInput(value);
    setMainInputFileContent(null);
  }, [value, updateInput]);

  const onOutputs = useCallback(
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
    [mainInputFile, jobInputs, setMainInputFileContent]
  );

  if (!options.current) return <></>;
  return (
    <PanelContainer gap={0}>
      <PanelHeader title={mainInputFile} preserveCase={true} onSave={onSave} />
      <div style={{height: 'calc(100% + 1rem)', width: '100%', position: 'relative', top: '-1.0rem'}} id={'mf-editor'}>
        <MetaframeStandaloneComponent
          url={`https://editor.mtfm.io/#?hm=disabled&options=${options.current}`}
          inputs={{text: value}}
          onOutputs={onOutputs as any}
        />
      </div>
    </PanelContainer>
  );
};