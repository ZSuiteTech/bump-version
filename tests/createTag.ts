import assert from 'assert'

// createTag reaches GitHub through @actions/github. Replace that module in the
// require cache before loading createTag: the compiled importStar copies a
// module's exports at load time, so patching it afterwards has no effect.
function loadCreateTag(recorder: any) {
    class GitHub {
        repos = { listTags: async () => ({ data: [] }) }
        git = {
            createTag: async (params: any) => {
                recorder.createTag = params
                return { data: { tag: params.tag, sha: 'tag-object-sha' } }
            },
            createRef: async (params: any) => ({
                data: { ref: params.ref, url: 'https://example.invalid/ref' },
            }),
        }
    }

    const githubPath = require.resolve('@actions/github')
    require.cache[githubPath] = {
        id: githubPath,
        filename: githubPath,
        loaded: true,
        exports: { GitHub },
    } as any

    const createTagPath = require.resolve('../src/createTag')
    delete require.cache[createTagPath]
    return require('../src/createTag').createTag
}

describe('createTag', () => {
    beforeEach(() => {
        process.env.GITHUB_WORKSPACE = '/tmp/workspace'
        process.env.GITHUB_REPOSITORY = 'ZSuiteTech/nzp-charts'
        process.env.GITHUB_REPOSITORY_OWNER = 'ZSuiteTech'
        process.env.GITHUB_TOKEN = 'token'
        process.env.GITHUB_SHA = 'triggering-commit-sha'
    })

    it('tags the commit it is given, not the triggering commit', async () => {
        // The bug this guards: the tag was created at GITHUB_SHA, which is the
        // commit that triggered the workflow, not the version-bump commit the
        // action had just pushed. Every tag therefore named a version whose
        // VERSION file was one commit newer than the tag pointed at.
        const recorder: any = {}
        const createTag = loadCreateTag(recorder)

        await createTag({
            tagName: '1.0.2713',
            tagMsg: 'Version 1.0.2713',
            object: 'bump-commit-sha',
        })

        assert.strictEqual(recorder.createTag.object, 'bump-commit-sha')
        assert.strictEqual(recorder.createTag.tag, '1.0.2713')
    })

    it('falls back to the triggering commit when given no object', async () => {
        const recorder: any = {}
        const createTag = loadCreateTag(recorder)

        await createTag({ tagName: '1.0.2713', tagMsg: 'Version 1.0.2713' })

        assert.strictEqual(recorder.createTag.object, 'triggering-commit-sha')
    })
})
