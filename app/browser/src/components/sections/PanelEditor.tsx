import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { MetaframeStandaloneComponent } from '@metapages/metapage-embed-react';
import PanelContainer from '/@/components/generic/PanelContainer';
import { PanelHeader } from '../generic/PanelHeader';
import { useHashParamJson } from '@metapages/hash-query';
import { useStore } from '/@/store';
import { JobInputs } from './PanelInputs';
import { encodeOptions } from '/@/shared';


export const PanelEditor: React.FC = () => {
  const [value, setValue] = useState(null);
  const [jobInputs, setJobInputs] = useHashParamJson<JobInputs | undefined>(
    "inputs"
  );
  const mainInputFile = useStore((state) => state.mainInputFile);
  const options = useRef('')

  useEffect(() => {
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
  }, [value, updateInput]);

  const onOutputs = useCallback(
    (outputs: any) => {
      if (outputs["text"] === undefined || outputs["text"] === null) {
        return;
      }
      const newValue = outputs["text"];
      setValue(newValue);
    },
    []
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
