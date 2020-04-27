const AWS = require('aws-sdk');

const processUserParameters = (userParams) => {
  const userObj = {};
  const pairs = userParams.split('&');
  for (let i = 0; i < pairs.length; ++i) {
    const [key, val] = pairs[i].split('=');
    userObj[key] = val;
  }
  return userObj;
}

const processArtifacts = (inputArtifacts) => {
  const artifacts = {};
  for (let i = 0; i < inputArtifacts.length; ++i) {
    item = inputArtifacts[i];
    artifacts[item.name] = item;
  }
  return artifacts;
}

exports.handler = async (event, context) => {

  // create a CodePipeline Object to use later
  const codePipeline = new AWS.CodePipeline();
  const lambda = new AWS.Lambda();
  // grab the code pipeline job id to acknowledge the job
  const jobId = event["CodePipeline.job"].id;
  // grab data about this build
  const { inputArtifacts, actionConfiguration } = event['CodePipeline.job'].data;

  try {
    console.log('Staring Deployment...');
    // process our user parameters
    const userParams = processUserParameters(actionConfiguration.configuration.UserParameters);
    const artifacts = processArtifacts(inputArtifacts);

    console.log('Updating Lambda Code...');
    console.log(`Dan object code: ${artifacts.build_output.location.s3Location.objectKey}`)
    // update the code
    const updateParams = {
      FunctionName: userParams.FUNCTION_NAME,
      S3Bucket: artifacts.build_output.location.s3Location.bucketName,
      S3Key: artifacts.build_output.location.s3Location.objectKey
    };
    const updateResponse = await lambda.updateFunctionCode(updateParams).promise();
    console.log('Update Lambda Code Success');
    console.log(require('util').inspect(updateResponse, { depth: null }));

    // create a version pointer
    console.log('Creating Version...');
    const publishParams = {
      CodeSha256: updateResponse.CodeSha256,
      Description: artifacts.source_output.revision,
      FunctionName: userParams.FUNCTION_NAME
    };
    const publishResponse = await lambda.publishVersion(publishParams).promise();
    console.log('Create Version Success');
    console.log(require('util').inspect(publishResponse, { depth: null }));

    // report success
    await codePipeline.putJobSuccessResult({ jobId }).promise();
    context.succeed('Sucessfully deployed.');
  }
  catch (err) {
    console.log('Error deploying.');
    console.log(err.message);
    const params = {
      jobId,
      failureDetails: {
        message: JSON.stringify(err.message),
        type: 'JobFailed',
        externalExecutionId: context.invokeid
      }
    };
    await codePipeline.putJobFailureResult(params).promise();
    context.fail(err.message);
    return err;
  }
  return 0;
};
